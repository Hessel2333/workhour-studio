use reqwest::{
    header::{CONTENT_TYPE, ETAG, IF_MATCH, IF_NONE_MATCH},
    Client, Method, RequestBuilder, StatusCode, Url,
};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CREDENTIAL_ACCOUNT: &str = "webdav-password";
const MAX_SYNC_BYTES: usize = 50 * 1024 * 1024;
const PROPFIND_BODY: &str = r#"<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/></prop></propfind>"#;
const CONNECTION_TEST_CONTENT: &[u8] = b"workhour-studio-webdav-connection-test";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConfig {
    endpoint: String,
    #[serde(default)]
    sync_folder: String,
    username: String,
    file_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConnectionRequest {
    config: WebDavConfig,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavPasswordRequest {
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavPutRequest {
    config: WebDavConfig,
    content: String,
    expected_etag: Option<String>,
    only_if_missing: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavTestResult {
    message: String,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum WebDavRemoteFile {
    Found {
        content: String,
        etag: Option<String>,
    },
    NotFound,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavPutResult {
    etag: Option<String>,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .cookie_store(true)
        .build()
        .map_err(|_| "无法初始化 WebDAV 连接。".to_string())
}

fn validate_path_segment(value: &str, label: &str) -> Result<(), String> {
    if value == "."
        || value == ".."
        || value.len() > 128
        || value.contains('/')
        || value.contains('\\')
        || value.contains('\0')
        || value.contains('?')
        || value.contains('#')
        || value.contains('%')
    {
        return Err(format!("{label}只能是一个不含路径的名称。"));
    }
    Ok(())
}

fn validate_config(config: &WebDavConfig) -> Result<Url, String> {
    let endpoint = config.endpoint.trim();
    if endpoint.is_empty() {
        return Err("请填写 WebDAV 文件夹地址。".to_string());
    }
    if config.username.trim().is_empty() {
        return Err("请填写 WebDAV 用户名。".to_string());
    }
    let file_name = config.file_name.trim();
    if file_name.is_empty() {
        return Err("请填写同步文件名。".to_string());
    }
    validate_path_segment(file_name, "同步文件名")?;

    let sync_folder = config.sync_folder.trim();
    if !sync_folder.is_empty() {
        validate_path_segment(sync_folder, "同步文件夹")?;
    }

    let url = Url::parse(endpoint).map_err(|_| "WebDAV 地址格式不正确。".to_string())?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() {
        return Err("WebDAV 地址必须是有效的 HTTP 或 HTTPS 地址。".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("请不要把账号或密码写进 WebDAV 地址，请使用下面的独立字段。".to_string());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("WebDAV 地址不能包含查询参数或锚点。".to_string());
    }

    Ok(url)
}

fn endpoint_directory_url(config: &WebDavConfig) -> Result<Url, String> {
    let mut url = validate_config(config)?;
    if !url.path().ends_with('/') {
        let directory_path = format!("{}/", url.path());
        url.set_path(&directory_path);
    }
    Ok(url)
}

fn sync_directory_url(config: &WebDavConfig) -> Result<Url, String> {
    let endpoint = endpoint_directory_url(config)?;
    let sync_folder = config.sync_folder.trim();
    if sync_folder.is_empty() {
        return Ok(endpoint);
    }
    endpoint
        .join(&format!("{sync_folder}/"))
        .map_err(|_| "无法生成 WebDAV 同步文件夹地址。".to_string())
}

fn remote_file_url(config: &WebDavConfig) -> Result<Url, String> {
    sync_directory_url(config)?
        .join(config.file_name.trim())
        .map_err(|_| "无法生成 WebDAV 同步文件地址。".to_string())
}

fn password_entry<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<keyring::Entry, String> {
    keyring::Entry::new(&app.config().identifier, CREDENTIAL_ACCOUNT)
        .map_err(|_| "无法访问系统凭据库。".to_string())
}

fn stored_password<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<String, String> {
    password_entry(app)?
        .get_password()
        .map_err(|_| "未找到 WebDAV 密码，请重新连接并保存。".to_string())
}

fn request_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "连接 WebDAV 服务器超时，请检查地址和网络。".to_string()
    } else if error.is_connect() {
        "无法连接 WebDAV 服务器，请检查地址和网络。".to_string()
    } else {
        "WebDAV 请求失败，请稍后重试。".to_string()
    }
}

fn response_error(action: &str, status: StatusCode) -> String {
    match status {
        StatusCode::UNAUTHORIZED => format!("{action}：服务器拒绝了身份验证（HTTP 401）。请确认 WebDAV 地址、用户名和密码。"),
        StatusCode::FORBIDDEN => format!("{action}：当前账号没有访问该 WebDAV 文件夹的权限。"),
        StatusCode::NOT_FOUND => format!("{action}：找不到指定的 WebDAV 文件夹或同步文件。"),
        _ => format!("{action}：服务器返回 HTTP {}。", status.as_u16()),
    }
}

fn with_basic_auth(
    request: RequestBuilder,
    config: &WebDavConfig,
    password: &str,
    include_auth: bool,
) -> RequestBuilder {
    if include_auth {
        request.basic_auth(config.username.trim(), Some(password))
    } else {
        request
    }
}

async fn send_authenticated<F>(build: F) -> Result<reqwest::Response, String>
where
    F: Fn(bool) -> RequestBuilder,
{
    let response = build(true).send().await.map_err(request_error)?;
    if response.status() != StatusCode::UNAUTHORIZED {
        return Ok(response);
    }

    // Some WebDAV servers expect a challenge before accepting a Basic-auth
    // request. Retry through that exchange while retaining same-host cookies.
    let challenge = build(false).send().await.map_err(request_error)?;
    if challenge.status() != StatusCode::UNAUTHORIZED {
        return Ok(challenge);
    }

    build(true).send().await.map_err(request_error)
}

async fn initial_options_probe(client: &Client, endpoint: Url) -> Result<(), String> {
    let response = client
        .request(Method::OPTIONS, endpoint)
        .send()
        .await
        .map_err(request_error)?;
    if response.status().is_success()
        || response.status() == StatusCode::UNAUTHORIZED
        || response.status() == StatusCode::METHOD_NOT_ALLOWED
    {
        return Ok(());
    }
    Err(response_error("连接测试失败", response.status()))
}

async fn options_request(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
    endpoint: Url,
) -> Result<reqwest::Response, String> {
    send_authenticated(|include_auth| {
        with_basic_auth(
            client.request(Method::OPTIONS, endpoint.clone()),
            config,
            password,
            include_auth,
        )
    })
    .await
}

async fn propfind_directory(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
    directory: Url,
) -> Result<reqwest::Response, String> {
    let propfind = Method::from_bytes(b"PROPFIND")
        .map_err(|_| "无法创建 WebDAV 验证请求。".to_string())?;
    send_authenticated(|include_auth| {
        with_basic_auth(
            client
                .request(propfind.clone(), directory.clone())
                .header("Depth", "0")
                .header(CONTENT_TYPE, "text/xml; charset=utf-8")
                .body(PROPFIND_BODY),
            config,
            password,
            include_auth,
        )
    })
    .await
}

async fn create_sync_folder(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
    directory: Url,
) -> Result<reqwest::Response, String> {
    let mkcol = Method::from_bytes(b"MKCOL")
        .map_err(|_| "无法创建 WebDAV 文件夹请求。".to_string())?;
    send_authenticated(|include_auth| {
        with_basic_auth(
            client.request(mkcol.clone(), directory.clone()),
            config,
            password,
            include_auth,
        )
    })
    .await
}

async fn ensure_sync_directory(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
    directory: Url,
) -> Result<(), String> {
    let propfind = propfind_directory(client, config, password, directory.clone()).await?;
    if propfind.status().is_success() {
        return Ok(());
    }
    if propfind.status() != StatusCode::NOT_FOUND || config.sync_folder.trim().is_empty() {
        return Err(response_error("连接测试失败", propfind.status()));
    }

    let created = create_sync_folder(client, config, password, directory.clone()).await?;
    if !created.status().is_success()
        && created.status() != StatusCode::METHOD_NOT_ALLOWED
        && created.status() != StatusCode::CONFLICT
    {
        return Err(response_error("无法创建同步文件夹", created.status()));
    }

    let confirmed = propfind_directory(client, config, password, directory).await?;
    if confirmed.status().is_success() {
        Ok(())
    } else {
        Err(response_error("无法访问同步文件夹", confirmed.status()))
    }
}

fn connection_test_file_name() -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "无法生成 WebDAV 连接测试文件。".to_string())?
        .as_nanos();
    Ok(format!(".workhour-studio-connection-test-{timestamp}.tmp"))
}

async fn delete_connection_test_file(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
    file_url: Url,
) -> Result<(), String> {
    let response = send_authenticated(|include_auth| {
        with_basic_auth(
            client.request(Method::DELETE, file_url.clone()),
            config,
            password,
            include_auth,
        )
    })
    .await?;
    if response.status().is_success() || response.status() == StatusCode::NOT_FOUND {
        Ok(())
    } else {
        Err(response_error("连接测试后清理临时文件失败", response.status()))
    }
}

async fn check_write_access(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
    directory: Url,
) -> Result<(), String> {
    let test_file = connection_test_file_name()?;
    let file_url = directory
        .join(&test_file)
        .map_err(|_| "无法生成 WebDAV 连接测试文件地址。".to_string())?;
    let upload = send_authenticated(|include_auth| {
        with_basic_auth(
            client
                .put(file_url.clone())
                .header(CONTENT_TYPE, "text/plain; charset=utf-8")
                .header(IF_NONE_MATCH, "*")
                .body(CONNECTION_TEST_CONTENT.to_vec()),
            config,
            password,
            include_auth,
        )
    })
    .await?;
    if !upload.status().is_success() {
        return Err(response_error("无法写入同步文件夹", upload.status()));
    }

    let read_result = async {
        let response = send_authenticated(|include_auth| {
            with_basic_auth(
                client.get(file_url.clone()),
                config,
                password,
                include_auth,
            )
        })
        .await?;
        if !response.status().is_success() {
            return Err(response_error("无法读取同步文件夹", response.status()));
        }
        let content = response.bytes().await.map_err(request_error)?;
        if content.as_ref() != CONNECTION_TEST_CONTENT {
            return Err("连接测试失败：服务器返回的测试文件内容不正确。".to_string());
        }
        Ok(())
    }
    .await;

    let cleanup_result = delete_connection_test_file(client, config, password, file_url).await;
    cleanup_result?;
    read_result
}

async fn check_directory(config: &WebDavConfig, password: &str) -> Result<(), String> {
    let client = client()?;
    let endpoint = endpoint_directory_url(config)?;
    initial_options_probe(&client, endpoint.clone()).await?;

    let options = options_request(&client, config, password, endpoint).await?;
    if !options.status().is_success() && options.status() != StatusCode::METHOD_NOT_ALLOWED {
        return Err(response_error("连接测试失败", options.status()));
    }

    let directory = sync_directory_url(config)?;
    ensure_sync_directory(&client, config, password, directory.clone()).await?;
    check_write_access(&client, config, password, directory).await
}

#[tauri::command]
pub async fn test_webdav_connection(
    request: WebDavConnectionRequest,
) -> Result<WebDavTestResult, String> {
    if request.password.is_empty() {
        return Err("请填写 WebDAV 密码或应用专用密码。".to_string());
    }
    check_directory(&request.config, &request.password).await?;
    Ok(WebDavTestResult {
        message: "WebDAV 连接正常。".to_string(),
    })
}

#[tauri::command]
pub fn store_webdav_password(
    app: tauri::AppHandle,
    request: WebDavPasswordRequest,
) -> Result<(), String> {
    if request.password.is_empty() {
        return Err("请填写 WebDAV 密码或应用专用密码。".to_string());
    }
    password_entry(&app)?
        .set_password(&request.password)
        .map_err(|_| "无法将 WebDAV 密码保存到系统凭据库。".to_string())
}

#[tauri::command]
pub fn delete_webdav_password(app: tauri::AppHandle) -> Result<(), String> {
    match password_entry(&app)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("无法从系统凭据库移除 WebDAV 密码。".to_string()),
    }
}

#[tauri::command]
pub async fn webdav_get_file(
    app: tauri::AppHandle,
    config: WebDavConfig,
) -> Result<WebDavRemoteFile, String> {
    let password = stored_password(&app)?;
    let url = remote_file_url(&config)?;
    let webdav_client = client()?;
    let response = send_authenticated(|include_auth| {
        with_basic_auth(
            webdav_client.get(url.clone()),
            &config,
            &password,
            include_auth,
        )
    })
    .await?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok(WebDavRemoteFile::NotFound);
    }
    if !response.status().is_success() {
        return Err(response_error("读取云端同步文件失败", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length as usize > MAX_SYNC_BYTES)
    {
        return Err("云端同步文件超过 50 MB，已停止读取。".to_string());
    }

    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = response.bytes().await.map_err(request_error)?;
    if bytes.len() > MAX_SYNC_BYTES {
        return Err("云端同步文件超过 50 MB，已停止读取。".to_string());
    }
    let content = String::from_utf8(bytes.to_vec())
        .map_err(|_| "云端同步文件不是有效的 UTF-8 JSON 数据。".to_string())?;

    Ok(WebDavRemoteFile::Found { content, etag })
}

#[tauri::command]
pub async fn webdav_put_file(
    app: tauri::AppHandle,
    request: WebDavPutRequest,
) -> Result<WebDavPutResult, String> {
    if request.content.len() > MAX_SYNC_BYTES {
        return Err("本地同步数据超过 50 MB，已停止上传。".to_string());
    }

    let password = stored_password(&app)?;
    let url = remote_file_url(&request.config)?;
    let webdav_client = client()?;
    let response = send_authenticated(|include_auth| {
        let mut upload = webdav_client
            .put(url.clone())
            .header(CONTENT_TYPE, "application/json; charset=utf-8")
            .body(request.content.clone());

        if let Some(etag) = request.expected_etag.as_deref() {
            upload = upload.header(IF_MATCH, etag);
        } else if request.only_if_missing {
            upload = upload.header(IF_NONE_MATCH, "*");
        }
        with_basic_auth(upload, &request.config, &password, include_auth)
    })
    .await?;
    if response.status() == StatusCode::PRECONDITION_FAILED {
        return Err(
            "CONFLICT: 云端同步文件已被其他设备修改，请重新同步后选择要保留的版本。".to_string(),
        );
    }
    if !response.status().is_success() {
        return Err(response_error("上传云端同步文件失败", response.status()));
    }

    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    Ok(WebDavPutResult { etag })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(endpoint: &str, sync_folder: &str, file_name: &str) -> WebDavConfig {
        WebDavConfig {
            endpoint: endpoint.to_string(),
            sync_folder: sync_folder.to_string(),
            username: "user".to_string(),
            file_name: file_name.to_string(),
        }
    }

    #[test]
    fn appends_sync_file_to_directory_url() {
        let url = remote_file_url(&config(
            "https://dav.example.com/remote.php/dav/files/user",
            "workhour-studio",
            "workhour-studio.sync.json",
        ))
        .expect("valid URL");
        assert_eq!(
            url.as_str(),
            "https://dav.example.com/remote.php/dav/files/user/workhour-studio/workhour-studio.sync.json"
        );
    }

    #[test]
    fn rejects_filename_with_path() {
        assert!(remote_file_url(&config(
            "https://dav.example.com/folder/",
            "workhour-studio",
            "nested/file.json"
        ))
        .is_err());
    }

    #[test]
    fn rejects_filename_that_can_change_the_target_url() {
        assert!(remote_file_url(&config(
            "https://dav.example.com/folder/",
            "workhour-studio",
            "../other-file.json"
        ))
        .is_err());
        assert!(remote_file_url(&config(
            "https://dav.example.com/folder/",
            "workhour-studio",
            "workhour.json?overwrite=true"
        ))
        .is_err());
    }

    #[test]
    fn rejects_sync_folder_that_can_change_the_target_url() {
        assert!(remote_file_url(&config(
            "https://dav.example.com/folder/",
            "../zotero",
            "workhour-studio.sync.json"
        ))
        .is_err());
        assert!(remote_file_url(&config(
            "https://dav.example.com/folder/",
            "workhour?folder=other",
            "workhour-studio.sync.json"
        ))
        .is_err());
    }

    #[test]
    fn accepts_the_frontend_camel_case_payload() {
        let request: WebDavConnectionRequest = serde_json::from_value(serde_json::json!({
            "config": {
                "endpoint": "https://dav.example.com/folder/",
                "syncFolder": "workhour-studio",
                "username": "user",
                "fileName": "workhour-studio.sync.json"
            },
            "password": "app-password"
        }))
        .expect("frontend payload should deserialize");

        assert_eq!(request.config.file_name, "workhour-studio.sync.json");
        assert_eq!(request.config.sync_folder, "workhour-studio");
    }
}
