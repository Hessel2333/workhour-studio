import pandas as pd
import os

def read_excel_structure():
    # 获取当前目录
    current_dir = os.path.dirname(os.path.abspath(__file__))
    excel_path = os.path.join(current_dir, "工时统计.xlsx")
    
    try:
        # 读取Excel文件
        df = pd.read_excel(excel_path)
        
        # 打印基本信息
        print("\n=== Excel文件基本信息 ===")
        print(f"文件路径: {excel_path}")
        print(f"\n数据维度: {df.shape[0]}行 x {df.shape[1]}列")
        
        print("\n=== 列名及数据类型 ===")
        for col, dtype in df.dtypes.items():
            print(f"列名: {col:<20} 数据类型: {dtype}")
            
        print("\n=== 前5行数据预览 ===")
        print(df.head())
        
        return df
        
    except FileNotFoundError:
        print(f"错误：未找到文件 '工时统计.xlsx'")
        print(f"请确保文件位于以下目录：{current_dir}")
    except Exception as e:
        print(f"读取文件时发生错误：{str(e)}")

if __name__ == "__main__":
    read_excel_structure() 