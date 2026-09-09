use serde::Deserialize;
use serde_json::Value;
use sqlx::SqlitePool;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Debug, Deserialize)]
pub struct Statement {
    query: String,
    values: Vec<Value>,
}

async fn execute_batch(pool: &SqlitePool, statements: Vec<Statement>) -> Result<(), String> {
    // All statements must use this transaction's connection. Separate plugin
    // execute calls can be dispatched to different connections in its pool.
    let mut transaction = pool.begin().await.map_err(|e| e.to_string())?;
    for statement in statements {
        let mut query = sqlx::query(&statement.query);
        for value in statement.values {
            query = match value {
                Value::Null => query.bind(None::<String>),
                Value::String(value) => query.bind(value),
                Value::Bool(value) => query.bind(value),
                Value::Number(value) if value.is_i64() => query.bind(value.as_i64().unwrap()),
                Value::Number(value) => query.bind(value.as_f64().ok_or("无效的数值")?),
                _ => return Err("不支持的数据库字段类型".to_string()),
            };
        }
        if let Err(error) = query.execute(&mut *transaction).await {
            transaction.rollback().await.map_err(|e| e.to_string())?;
            return Err(format!("保存失败，已回滚本次修改：{error}"));
        }
    }
    transaction.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_workspace_batch(
    databases: tauri::State<'_, DbInstances>,
    statements: Vec<Statement>,
) -> Result<(), String> {
    let instances = databases.0.read().await;
    let Some(DbPool::Sqlite(pool)) = instances.get("sqlite:workhour-studio.db") else {
        return Err("本地数据库尚未成功打开，请重新启动应用。".to_string());
    };
    execute_batch(pool, statements).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn statement(query: &str, values: Vec<Value>) -> Statement {
        Statement {
            query: query.to_string(),
            values,
        }
    }

    #[test]
    fn batch_commits_and_rolls_back_on_the_same_connection() {
        tauri::async_runtime::block_on(async {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(3)
                .connect("sqlite::memory:")
                .await
                .unwrap();
            sqlx::query("CREATE TABLE records (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
                .execute(&pool)
                .await
                .unwrap();
            execute_batch(
                &pool,
                vec![statement(
                    "INSERT INTO records VALUES (?, ?)",
                    vec!["old".into(), "原数据".into()],
                )],
            )
            .await
            .unwrap();
            let error = execute_batch(
                &pool,
                vec![
                    statement("DELETE FROM records", vec![]),
                    statement(
                        "INSERT INTO records VALUES (?, ?)",
                        vec!["new".into(), "新数据".into()],
                    ),
                    statement(
                        "INSERT INTO records VALUES (?, ?)",
                        vec!["broken".into(), Value::Null],
                    ),
                ],
            )
            .await;
            assert!(error.is_err());
            let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM records")
                .fetch_all(&pool)
                .await
                .unwrap();
            assert_eq!(rows, vec![("old".into(), "原数据".into())]);
            execute_batch(
                &pool,
                vec![
                    statement("DELETE FROM records", vec![]),
                    statement(
                        "INSERT INTO records VALUES (?, ?)",
                        vec!["new".into(), "新数据".into()],
                    ),
                ],
            )
            .await
            .unwrap();
            let id: String = sqlx::query_scalar("SELECT id FROM records")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(id, "new");
            pool.close().await;
        });
    }
}
