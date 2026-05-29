"use client";
import * as XLSX from 'xlsx';
import { useState, useRef } from 'react';
import { Check, ChevronLeft, ChevronRight, Upload, Settings, Clock, Calendar, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Toast from './components/Toast';

interface ScheduleConfig {
  weekday: number;      // 周几（1-5）
  startHour: number;    // 开始小时
  startMinute: number;  // 开始分钟
  endHour: number;      // 结束小时
  endMinute: number;    // 结束分钟
}

// 随机时段工作内容
interface RandomWorkItem {
  id: number;
  workNature: string;      // 工作性质
  workType: string;        // 工作类别
  contentType: string;     // 内容属性
  workForm: string;        // 工作形式
  remarks: string;         // 备注
  collaborator: string;    // 共同完成人
  weight: number;          // 权重
}

// 固定时段工作内容
interface FixedWorkItem {
  id: number;
  description: string;     // 描述
  workNature: string;      // 工作性质
  workType: string;        // 工作类别
  contentType: string;     // 内容属性
  workForm: string;        // 工作形式
  remarks: string;         // 备注
  collaborator: string;    // 共同完成人
  schedule: ScheduleConfig;// 固定时段
}

// Excel数据行
interface ExcelRow {
  '月日': string;
  '开始时间': string;
  '结束时间': string;
  '工作性质': string;
  '工作类别': string;
  '内容属性': string;
  '工作形式': string;
  '备注': string;
  '共同完成人': string;
}

// 周末讲堂配置
interface WeekendLecture {
  date: string; // YYYY-MM-DD格式
  enabled: boolean; // 是否进行周末讲堂
}

// 周末讲堂模板
interface WeekendLectureTemplate {
  workNature: string;      // 工作性质
  workType: string;        // 工作类别
  contentType: string;     // 内容属性
  workForm: string;        // 工作形式
  remarks: string;         // 备注
  collaborator: string;    // 共同完成人
  startHour: number;       // 开始小时
  startMinute: number;     // 开始分钟
  endHour: number;         // 结束小时
  endMinute: number;       // 结束分钟
}

export default function Home() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [employeeName, setEmployeeName] = useState("员工");
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('templates');
  const [randomWorkItems, setRandomWorkItems] = useState<RandomWorkItem[]>([]);
  const [fixedWorkItems, setFixedWorkItems] = useState<FixedWorkItem[]>([]);
  const [weekendLectures, setWeekendLectures] = useState<WeekendLecture[]>([]);
  
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [showNewFixedItemForm, setShowNewFixedItemForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerateSuccess, setIsGenerateSuccess] = useState(false);
  const [fileName, setFileName] = useState("");
  const [currentWorkbook, setCurrentWorkbook] = useState<XLSX.WorkBook | null>(null);
  
  // Toast状态
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  
  // 周末讲堂模板状态
  const [weekendLectureTemplate, setWeekendLectureTemplate] = useState<WeekendLectureTemplate>({
    workNature: '科研工作',
    workType: '其他科研',
    contentType: '备注',
    workForm: '基地会议',
    remarks: '周末讲堂',
    collaborator: '',
    startHour: 9,
    startMinute: 0,
    endHour: 11,
    endMinute: 30
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calendar data for the selected month
  const daysOfWeek = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  // Define day types: 'work' (green), 'weekend' (blue), 'holiday' (red)
  const dayTypes: { [key: number]: "work" | "weekend" | "holiday" } = {};

  // 新模板状态
  const [newRandomItem, setNewRandomItem] = useState<RandomWorkItem>({
    id: Date.now(),
    workNature: '',
    workType: '',
    contentType: '',
    workForm: '',
    remarks: '',
    collaborator: '',
    weight: 1
  });

  const [newFixedItem, setNewFixedItem] = useState<FixedWorkItem>({
    id: Date.now(),
    description: '',
    workNature: '',
    workType: '',
    contentType: '',
    workForm: '',
    remarks: '',
    collaborator: '',
    schedule: {
      weekday: 1,
      startHour: 8,
      startMinute: 0,
      endHour: 9,
      endMinute: 0
    }
  });

  // 获取当月所有周六
  const getSaturdaysInMonth = () => {
    const saturdays = [];
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(selectedYear, selectedMonth - 1, day);
      const weekday = date.getDay();
      if (weekday === 6) { // 周六
        const dateString = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        saturdays.push({
          day,
          date: dateString,
          enabled: weekendLectures.find(lecture => lecture.date === dateString)?.enabled ?? true
        });
      }
    }
    return saturdays;
  };

  // 检查某个日期是否有周末讲堂
  const hasWeekendLecture = (day: number, weekday: number) => {
    if (weekday !== 6) return false; // 只有周六才可能有周末讲堂
    const dateString = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return weekendLectures.find(lecture => lecture.date === dateString)?.enabled ?? true;
  };

  // 获取月份的所有日期
  const getDaysInMonth = () => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const days = [];
    
    // 获取当月1号是星期几 (1=周一, 2=周二, ..., 7=周日)
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1).getDay() || 7;
    
    // 添加上个月的日期填充第一周
    const prevMonthDays = new Date(selectedYear, selectedMonth - 1, 0).getDate();
    for (let i = firstDay - 1; i > 0; i--) {
      const prevDate = new Date(selectedYear, selectedMonth - 2, prevMonthDays - i + 1);
      const weekday = prevDate.getDay() || 7;
      days.push({ 
        day: prevMonthDays - i + 1, 
        weekday,
        isCurrentMonth: false 
      });
    }
    
    // 添加当月日期
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(selectedYear, selectedMonth - 1, day);
      const weekday = date.getDay() || 7; // 将0（周日）转换为7
      days.push({ 
        day, 
        weekday,
        isCurrentMonth: true 
      });
    }
    
    // 添加下个月的日期填充最后一周
    const totalCells = Math.ceil(days.length / 7) * 7;
    const nextMonthDays = totalCells - days.length;
    for (let i = 1; i <= nextMonthDays; i++) {
      const nextDate = new Date(selectedYear, selectedMonth, i);
      const weekday = nextDate.getDay() || 7;
      days.push({ 
        day: i, 
        weekday,
        isCurrentMonth: false 
      });
    }
    
    return days;
  };

  const getDayColor = (day: number, weekday: number, isCurrentMonth = true, isHovered = false) => {
    const baseClasses = "transition-colors duration-150 ease-out";
    const shadow = isHovered ? "shadow-md" : "shadow-sm";
    const opacity = isCurrentMonth ? "" : "opacity-30";

    // 周六且有周末讲堂显示蓝色
    if (weekday === 6 && isCurrentMonth && hasWeekendLecture(day, weekday)) {
      return `${baseClasses} ${shadow} ${opacity} bg-gradient-to-br from-blue-400 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white border-0`;
    }
    // 其他周末（周六无讲堂、周日）显示红色
    else if (weekday === 6 || weekday === 7) {
      return `${baseClasses} ${shadow} ${opacity} bg-gradient-to-br from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white border-0`;
    } else {
      // 工作日显示绿色
      return `${baseClasses} ${shadow} ${opacity} bg-gradient-to-br from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 text-white border-0`;
    }
  };

  // 显示Toast
  const showToastMessage = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };

  // 导入配置
  const importConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target?.result as string);
          
          // 导入随机时段工作内容
          if (jsonData.随机时段工作内容) {
            const randomItems = jsonData.随机时段工作内容.map((item: any) => ({
              id: Date.now() + Math.random(),
              workNature: item.工作性质 || '',
              workType: item.工作类别 || '',
              contentType: item.内容属性 || '',
              workForm: item.工作形式 || '',
              remarks: item.备注 || '',
              collaborator: item.共同完成人 || '',
              weight: Number(item.权重) || 1
            }));
            setRandomWorkItems(randomItems);
          }

          // 导入固定时段工作内容
          if (jsonData.固定时段工作内容) {
            const fixedItems = jsonData.固定时段工作内容.map((item: any) => ({
              id: Date.now() + Math.random(),
              description: item.描述 || '',
              workNature: item.工作性质 || '',
              workType: item.工作类别 || '',
              contentType: item.内容属性 || '',
              workForm: item.工作形式 || '',
              remarks: item.备注 || '',
              collaborator: item.共同完成人 || '',
              schedule: {
                weekday: item.固定时段?.周几 || 1,
                startHour: item.固定时段?.开始时间_时 || 8,
                startMinute: item.固定时段?.开始时间_分 || 0,
                endHour: item.固定时段?.结束时间_时 || 9,
                endMinute: item.固定时段?.结束时间_分 || 0
              }
            }));
            setFixedWorkItems(fixedItems);
          }

          // 导入周末讲堂数据
          if (jsonData.周末讲堂) {
            const weekendLectureItems = jsonData.周末讲堂.map((item: any) => ({
              date: item.日期 || '',
              enabled: item.是否进行 !== undefined ? item.是否进行 : true
            }));
            setWeekendLectures(weekendLectureItems);
          }

          // 导入周末讲堂模板
          if (jsonData.周末讲堂模板) {
            setWeekendLectureTemplate({
              workNature: jsonData.周末讲堂模板.工作性质 || '科研工作',
              workType: jsonData.周末讲堂模板.工作类别 || '其他科研',
              contentType: jsonData.周末讲堂模板.内容属性 || '备注',
              workForm: jsonData.周末讲堂模板.工作形式 || '基地会议',
              remarks: jsonData.周末讲堂模板.备注 || '周末讲堂',
              collaborator: jsonData.周末讲堂模板.共同完成人 || '',
              startHour: jsonData.周末讲堂模板.开始小时 || 9,
              startMinute: jsonData.周末讲堂模板.开始分钟 || 0,
              endHour: jsonData.周末讲堂模板.结束小时 || 11,
              endMinute: jsonData.周末讲堂模板.结束分钟 || 30
            });
          }

          showToastMessage('配置导入成功！', 'success');
        } catch (error) {
          showToastMessage('配置文件格式错误，请确保是正确的JSON格式！', 'error');
        }
      };
      reader.readAsText(file);
    }
  };

  // 导出配置
  const exportConfig = () => {
    const configData = {
      随机时段工作内容: randomWorkItems.map(item => ({
        工作性质: item.workNature,
        工作类别: item.workType,
        内容属性: item.contentType,
        工作形式: item.workForm,
        备注: item.remarks,
        共同完成人: item.collaborator,
        权重: item.weight
      })),
      固定时段工作内容: fixedWorkItems.map(item => ({
        描述: item.description,
        工作性质: item.workNature,
        工作类别: item.workType,
        内容属性: item.contentType,
        工作形式: item.workForm,
        备注: item.remarks,
        共同完成人: item.collaborator,
        固定时段: {
          周几: item.schedule.weekday,
          开始时间_时: item.schedule.startHour,
          开始时间_分: item.schedule.startMinute,
          结束时间_时: item.schedule.endHour,
          结束时间_分: item.schedule.endMinute
        }
      })),
      周末讲堂: weekendLectures.map(item => ({
        日期: item.date,
        是否进行: item.enabled
      })),
      周末讲堂模板: {
        工作性质: weekendLectureTemplate.workNature,
        工作类别: weekendLectureTemplate.workType,
        内容属性: weekendLectureTemplate.contentType,
        工作形式: weekendLectureTemplate.workForm,
        备注: weekendLectureTemplate.remarks,
        共同完成人: weekendLectureTemplate.collaborator,
        开始小时: weekendLectureTemplate.startHour,
        开始分钟: weekendLectureTemplate.startMinute,
        结束小时: weekendLectureTemplate.endHour,
        结束分钟: weekendLectureTemplate.endMinute
      }
    };
    
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '工作内容配置.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 根据权重随机选择工作项
  const selectRandomItem = (workItems: RandomWorkItem[]) => {
    const totalWeight = workItems.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedItem = workItems[0];
    
    for (const item of workItems) {
      if (random <= item.weight) {
        selectedItem = item;
        break;
      }
      random -= item.weight;
    }
    return selectedItem;
  };

  // 生成Excel文件
  const generateExcel = async () => {
    if (randomWorkItems.length === 0) {
      showToastMessage('请至少添加一项随机时段的工作内容！', 'error');
      return;
    }

    setIsGenerating(true);
    setIsGenerateSuccess(false);
    setCurrentWorkbook(null);

    // 添加一个小延迟以显示加载动画
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      // 创建工作簿
      const wb = XLSX.utils.book_new();
      
      // 准备数据
      const data: ExcelRow[] = [];
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      
      // 预定义的时长分配模式（以30分钟为单位）
      const morningPatterns = [
        [2, 2, 3],     // 2+2+3 = 7个时段
        [3, 4],        // 3+4 = 7个时段
        [2, 5],        // 2+5 = 7个时段
        [7]            // 全部一样 = 7个时段
      ];
      
      const afternoonPatterns = [
        [2, 2, 2, 2],  // 2+2+2+2 = 8个时段  
        [2, 2, 4],     // 2+2+4 = 8个时段
        [4, 4],        // 4+4 = 8个时段
        [3, 5],        // 3+5 = 8个时段
        [2, 6],        // 2+6 = 8个时段
        [8]            // 全部一样 = 8个时段
      ];
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth - 1, day);
        const weekday = date.getDay() || 7; // 将0（周日）转换为7
        let isFirstRowOfDay = true;
        
        // 为当天选择分配模式
        const morningPattern = morningPatterns[Math.floor(Math.random() * morningPatterns.length)];
        const afternoonPattern = afternoonPatterns[Math.floor(Math.random() * afternoonPatterns.length)];
        
        // 生成当天的工作项序列
        const dailyWorkItems: any[] = [];
        
        // 上午工作项
        for (const duration of morningPattern) {
          for (let i = 0; i < duration; i++) {
            if (i === 0) {
              // 第一个时段，选择新的工作项
              dailyWorkItems.push(selectRandomItem(randomWorkItems));
            } else {
              // 后续时段，重复使用相同工作项
              dailyWorkItems.push(dailyWorkItems[dailyWorkItems.length - 1]);
            }
          }
        }
        
        // 下午工作项  
        for (const duration of afternoonPattern) {
          for (let i = 0; i < duration; i++) {
            if (i === 0) {
              // 第一个时段，选择新的工作项
              dailyWorkItems.push(selectRandomItem(randomWorkItems));
            } else {
              // 后续时段，重复使用相同工作项
              dailyWorkItems.push(dailyWorkItems[dailyWorkItems.length - 1]);
            }
          }
        }
        
        let workItemIndex = 0; // 当前工作项索引
        
        // 每天的时间段
        for (let hour = 8; hour < 17; hour++) {
          // 处理每个小时的两个30分钟时段
          for (let minute = 0; minute < 60; minute += 30) {
            const isLunchBreak = (hour === 11 && minute === 30) || hour === 12;
            const isWeekend = weekday === 6 || weekday === 7;
            
            // 简化周末讲堂时间判断 - 直接使用用户设定的时间范围
            const currentTimeMinutes = hour * 60 + minute;
            const lectureStartMinutes = weekendLectureTemplate.startHour * 60 + weekendLectureTemplate.startMinute;
            const lectureEndMinutes = weekendLectureTemplate.endHour * 60 + weekendLectureTemplate.endMinute;
            const isWeekendLecture = weekday === 6 && hasWeekendLecture(day, weekday) && 
              currentTimeMinutes >= lectureStartMinutes && currentTimeMinutes < lectureEndMinutes;

            if (isWeekendLecture) {
              // 周末讲堂时段（优先判断，包含午休时间）
              data.push({
                '月日': isFirstRowOfDay ? `${selectedMonth}月${day}日` : '',
                '开始时间': `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                '结束时间': minute === 30 ? 
                  `${(hour + 1).toString().padStart(2, '0')}:00` : 
                  `${hour.toString().padStart(2, '0')}:30`,
                '工作性质': weekendLectureTemplate.workNature,
                '工作类别': weekendLectureTemplate.workType,
                '内容属性': weekendLectureTemplate.contentType,
                '工作形式': weekendLectureTemplate.workForm,
                '备注': weekendLectureTemplate.remarks,
                '共同完成人': weekendLectureTemplate.collaborator
              });
            } else if (isLunchBreak) {
              // 午休时间只保留时间，其他字段留空
              data.push({
                '月日': isFirstRowOfDay ? `${selectedMonth}月${day}日` : '',
                '开始时间': `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                '结束时间': minute === 30 ? 
                  `${(hour + 1).toString().padStart(2, '0')}:00` : 
                  `${hour.toString().padStart(2, '0')}:30`,
                '工作性质': '',
                '工作类别': '',
                '内容属性': '',
                '工作形式': '',
                '备注': '',
                '共同完成人': ''
              });
            } else if (isWeekend) {
              // 其他周末时间只显示时间
              data.push({
                '月日': isFirstRowOfDay ? `${selectedMonth}月${day}日` : '',
                '开始时间': `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                '结束时间': minute === 30 ? 
                  `${(hour + 1).toString().padStart(2, '0')}:00` : 
                  `${hour.toString().padStart(2, '0')}:30`,
                '工作性质': '',
                '工作类别': '',
                '内容属性': '',
                '工作形式': '',
                '备注': '',
                '共同完成人': ''
              });
            } else {
              // 检查是否在固定时段内
              const fixedItem = fixedWorkItems.find(item => {
                const schedule = item.schedule;
                if (schedule.weekday === weekday) {
                  const timeValue = hour + minute / 60;
                  const startValue = schedule.startHour + schedule.startMinute / 60;
                  const endValue = schedule.endHour + schedule.endMinute / 60;
                  return timeValue >= startValue && timeValue < endValue;
                }
                return false;
              });

              let selectedItem;
              if (fixedItem) {
                selectedItem = fixedItem;
              } else {
                // 使用预先规划的工作项
                selectedItem = dailyWorkItems[workItemIndex] || selectRandomItem(randomWorkItems);
                workItemIndex++;
              }

              data.push({
                '月日': isFirstRowOfDay ? `${selectedMonth}月${day}日` : '',
                '开始时间': `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                '结束时间': minute === 30 ? 
                  `${(hour + 1).toString().padStart(2, '0')}:00` : 
                  `${hour.toString().padStart(2, '0')}:30`,
                '工作性质': selectedItem.workNature,
                '工作类别': selectedItem.workType,
                '内容属性': selectedItem.contentType,
                '工作形式': selectedItem.workForm,
                '备注': selectedItem.remarks,
                '共同完成人': selectedItem.collaborator
              });
            }
            
            isFirstRowOfDay = false;
          }
        }
        
        // 在每天的数据后添加一个空行（除了最后一天）
        if (day < daysInMonth) {
          data.push({
            '月日': '',
            '开始时间': '',
            '结束时间': '',
            '工作性质': '',
            '工作类别': '',
            '内容属性': '',
            '工作形式': '',
            '备注': '',
            '共同完成人': ''
          });
        }
      }
      
      // 创建工作表
      const ws = XLSX.utils.json_to_sheet(data);
      
      // 设置列宽
      const colWidths = {
        '月日': 10,
        '开始时间': 10,
        '结束时间': 10,
        '工作性质': 15,
        '工作类别': 15,
        '内容属性': 15,
        '工作形式': 15,
        '备注': 20,
        '共同完成人': 15
      };
      
      ws['!cols'] = Object.values(colWidths).map(width => ({ width }));
      
      // 将工作表添加到工作簿
      XLSX.utils.book_append_sheet(wb, ws, "工时统计表");
      
      // 生成文件名
      const newFileName = `工时统计表_${selectedYear}年${selectedMonth}月.xlsx`;
      
      // 生成并下载文件
      const blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = newFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // 更新状态
      setFileName(newFileName);
      setCurrentWorkbook(wb);
      setIsGenerateSuccess(true);
      setIsGenerating(false);
      showToastMessage('Excel文件生成成功！', 'success');
    } catch (error) {
      console.error('生成Excel文件失败:', error);
      showToastMessage('生成Excel文件失败，请重试！', 'error');
      setIsGenerating(false);
      setIsGenerateSuccess(false);
      setCurrentWorkbook(null);
    }
  };

  // 添加随机工作项
  const addRandomItem = () => {
    if (newRandomItem.workNature && newRandomItem.workType && newRandomItem.workForm) {
      setRandomWorkItems([{ ...newRandomItem, id: Date.now() }, ...randomWorkItems]);
      setNewRandomItem({
        id: Date.now(),
        workNature: '',
        workType: '',
        contentType: '',
        workForm: '',
        remarks: '',
        collaborator: '',
        weight: 1
      });
      setShowNewItemForm(false);
      showToastMessage('工作模板添加成功！', 'success');
    } else {
      showToastMessage('请填写必填字段（工作性质、工作类别、工作形式）', 'error');
    }
  };

  // 添加固定工作项
  const addFixedItem = () => {
    if (newFixedItem.description && newFixedItem.workNature && newFixedItem.workType && newFixedItem.workForm) {
      setFixedWorkItems([{ ...newFixedItem, id: Date.now() }, ...fixedWorkItems]);
      setNewFixedItem({
        id: Date.now(),
        description: '',
        workNature: '',
        workType: '',
        contentType: '',
        workForm: '',
        remarks: '',
        collaborator: '',
        schedule: {
          weekday: 1,
          startHour: 8,
          startMinute: 0,
          endHour: 9,
          endMinute: 0
        }
      });
      setShowNewFixedItemForm(false);
      showToastMessage('固定安排添加成功！', 'success');
    } else {
      showToastMessage('请填写必填字段（描述、工作性质、工作类别、工作形式）', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Backdrop blur effect */}
      <div className="fixed inset-0 bg-white/80 backdrop-blur-xl -z-10" />

      <div className="relative z-10 p-6 lg:p-8">
        {/* Header with Apple-style design */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-gray-900 to-gray-700 rounded-2xl flex items-center justify-center shadow-lg transition-colors duration-200 group-hover:from-gray-800 group-hover:to-gray-600">
              <Check className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">工时表生成器</h1>
          </div>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Left Panel - Basic Information */}
          <Card className="backdrop-blur-xl bg-white/90 border-0 shadow-xl rounded-3xl overflow-hidden transition-shadow duration-200 hover:shadow-2xl">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Settings className="w-4 h-4 text-white" />
                </div>
                基本信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8 px-8 pb-8">
              {/* Employee Name */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700 tracking-wide">员工姓名</label>
                <Input
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="请输入员工姓名"
                  className="h-12 rounded-2xl border-gray-200 bg-gray-50/50 backdrop-blur-sm transition-all duration-200 focus:bg-white focus:shadow-lg text-base"
                />
              </div>

              {/* Year and Month Selectors */}
              <div className="flex items-center justify-center gap-8 py-6">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedYear(selectedYear - 1)}
                    className="w-10 h-10 rounded-full hover:bg-gray-100 transition-colors duration-150"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <span className="text-xl font-semibold min-w-[90px] text-center text-gray-900">{selectedYear}年</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedYear(selectedYear + 1)}
                    className="w-10 h-10 rounded-full hover:bg-gray-100 transition-colors duration-150"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedMonth === 1) {
                        setSelectedMonth(12);
                        setSelectedYear(selectedYear - 1);
                      } else {
                        setSelectedMonth(selectedMonth - 1);
                      }
                    }}
                    className="w-10 h-10 rounded-full hover:bg-gray-100 transition-colors duration-150"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <span className="text-xl font-semibold min-w-[70px] text-center text-gray-900">
                    {selectedMonth}月
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedMonth === 12) {
                        setSelectedMonth(1);
                        setSelectedYear(selectedYear + 1);
                      } else {
                        setSelectedMonth(selectedMonth + 1);
                      }
                    }}
                    className="w-10 h-10 rounded-full hover:bg-gray-100 transition-colors duration-150"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Upload Configuration */}
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-14 rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 text-base font-medium"
              >
                <Upload className="w-5 h-5 mr-3" />
                导入配置文件
              </Button>
              <input
                type="file"
                accept=".json"
                onChange={importConfig}
                ref={fileInputRef}
                className="hidden"
              />

              {/* Action Buttons */}
              <div className="space-y-4">
                <Button 
                  onClick={exportConfig}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-200 text-base font-semibold"
                >
                  保存并导出配置
                </Button>
                <Button 
                  onClick={generateExcel}
                  disabled={isGenerating}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg hover:shadow-xl transition-all duration-200 text-base font-semibold disabled:opacity-50"
                >
                  {isGenerating ? (
                    <span className="mr-2">⏳</span>
                  ) : (
                    <span className="mr-2">✏️</span>
                  )}
                  {isGenerating ? "正在生成..." : "生成工时表"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel - Work Calendar */}
          <Card className="backdrop-blur-xl bg-white/90 border-0 shadow-xl rounded-3xl overflow-hidden transition-shadow duration-200 hover:shadow-2xl">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                工作日历
              </CardTitle>
              <p className="text-sm text-gray-600 mt-2">工作日显示绿色，有周末讲堂的周六显示蓝色，其他周末显示红色</p>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              {/* Days of Week Header */}
              <div className="grid grid-cols-7 gap-2 mb-4">
                {daysOfWeek.map((day) => (
                  <div key={day} className="text-center text-sm font-semibold text-gray-600 py-3">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {getDaysInMonth().map(({ day, weekday, isCurrentMonth }, index) => (
                  <button
                    key={`${day}-${isCurrentMonth}-${index}`}
                    className={`h-14 w-full rounded-2xl font-semibold text-base ${getDayColor(day, weekday, isCurrentMonth, hoveredDay === day)}`}
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Section - Work Templates */}
        <div className="max-w-7xl mx-auto mt-12">
          <Tabs defaultValue="templates" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-100/80 backdrop-blur-xl rounded-2xl p-2 h-14">
              <TabsTrigger
                value="templates"
                className="flex items-center gap-2 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg transition-all duration-200 font-medium"
              >
                <Settings className="w-4 h-4" />
                工作模板
              </TabsTrigger>
              <TabsTrigger
                value="fixed"
                className="flex items-center gap-2 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg transition-all duration-200 font-medium"
              >
                <Clock className="w-4 h-4" />
                固定安排
              </TabsTrigger>
              <TabsTrigger
                value="weekend"
                className="flex items-center gap-2 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg transition-all duration-200 font-medium"
              >
                <Calendar className="w-4 h-4" />
                周末讲堂
              </TabsTrigger>
            </TabsList>

            <TabsContent value="templates" className="mt-8">
              <Card className="backdrop-blur-xl bg-white/90 border-0 shadow-xl rounded-3xl overflow-hidden transition-shadow duration-200 hover:shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-6">
                  <CardTitle className="text-xl font-semibold text-gray-900">工作模板配置</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setShowNewItemForm(true)}
                    className="h-10 px-4 rounded-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    添加模板
                  </Button>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  <div className="space-y-4">
                    {/* 添加新模板表单 */}
                    {showNewItemForm && (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border-2 border-dashed border-blue-200">
                        <div className="grid grid-cols-3 gap-6 mb-4">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作性质</label>
                            <Input
                              value={newRandomItem.workNature}
                              onChange={(e) => setNewRandomItem({...newRandomItem, workNature: e.target.value})}
                              placeholder="输入工作性质"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作类别</label>
                            <Input
                              value={newRandomItem.workType}
                              onChange={(e) => setNewRandomItem({...newRandomItem, workType: e.target.value})}
                              placeholder="输入工作类别"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">内容属性</label>
                            <Input
                              value={newRandomItem.contentType}
                              onChange={(e) => setNewRandomItem({...newRandomItem, contentType: e.target.value})}
                              placeholder="输入内容属性"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-6 mb-6">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作形式</label>
                            <Input
                              value={newRandomItem.workForm}
                              onChange={(e) => setNewRandomItem({...newRandomItem, workForm: e.target.value})}
                              placeholder="输入工作形式"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">备注</label>
                            <Input
                              value={newRandomItem.remarks}
                              onChange={(e) => setNewRandomItem({...newRandomItem, remarks: e.target.value})}
                              placeholder="输入备注"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">共同完成人</label>
                            <Input
                              value={newRandomItem.collaborator}
                              onChange={(e) => setNewRandomItem({...newRandomItem, collaborator: e.target.value})}
                              placeholder="输入共同完成人"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">权重</label>
                            <Input
                              type="number"
                              value={newRandomItem.weight}
                              onChange={(e) => setNewRandomItem({...newRandomItem, weight: Number(e.target.value)})}
                              placeholder="1"
                              min="1"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-3">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowNewItemForm(false);
                              setNewRandomItem({
                                id: Date.now(),
                                workNature: '',
                                workType: '',
                                contentType: '',
                                workForm: '',
                                remarks: '',
                                collaborator: '',
                                weight: 1
                              });
                            }}
                            className="h-10 px-6 rounded-xl border-gray-200 hover:bg-gray-50 transition-all duration-200"
                          >
                            取消
                          </Button>
                          <Button
                            onClick={addRandomItem}
                            className="h-10 px-6 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-200"
                          >
                            确定
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 已添加的随机时段工作内容列表 */}
                    {randomWorkItems.map((item) => (
                      <div key={item.id} 
                        className="bg-gradient-to-r from-white to-gray-50 p-6 rounded-2xl border border-gray-200 transition-all duration-300 hover:border-blue-300 hover:shadow-lg"
                      >
                        {/* 第一行：工作性质、类别、内容属性 */}
                        <div className="grid grid-cols-3 gap-6 mb-4">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作性质</label>
                            <Input
                              value={item.workNature}
                              onChange={(e) => {
                                const updatedItems = randomWorkItems.map(i => 
                                  i.id === item.id ? { ...i, workNature: e.target.value } : i
                                );
                                setRandomWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作类别</label>
                            <Input
                              value={item.workType}
                              onChange={(e) => {
                                const updatedItems = randomWorkItems.map(i => 
                                  i.id === item.id ? { ...i, workType: e.target.value } : i
                                );
                                setRandomWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">内容属性</label>
                            <Input
                              value={item.contentType}
                              onChange={(e) => {
                                const updatedItems = randomWorkItems.map(i => 
                                  i.id === item.id ? { ...i, contentType: e.target.value } : i
                                );
                                setRandomWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                        </div>

                        {/* 第二行：工作形式、备注、共同完成人、权重、删除按钮 */}
                        <div className="grid grid-cols-5 gap-6">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作形式</label>
                            <Input
                              value={item.workForm}
                              onChange={(e) => {
                                const updatedItems = randomWorkItems.map(i => 
                                  i.id === item.id ? { ...i, workForm: e.target.value } : i
                                );
                                setRandomWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">备注</label>
                            <Input
                              value={item.remarks}
                              onChange={(e) => {
                                const updatedItems = randomWorkItems.map(i => 
                                  i.id === item.id ? { ...i, remarks: e.target.value } : i
                                );
                                setRandomWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">共同完成人</label>
                            <Input
                              value={item.collaborator}
                              onChange={(e) => {
                                const updatedItems = randomWorkItems.map(i => 
                                  i.id === item.id ? { ...i, collaborator: e.target.value } : i
                                );
                                setRandomWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">权重</label>
                            <Input
                              type="number"
                              value={item.weight}
                              onChange={(e) => {
                                const updatedItems = randomWorkItems.map(i => 
                                  i.id === item.id ? { ...i, weight: Number(e.target.value) } : i
                                );
                                setRandomWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                              min="1"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRandomWorkItems(randomWorkItems.filter(i => i.id !== item.id));
                              }}
                              className="w-full h-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-all duration-200"
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* 空状态提示 */}
                    {randomWorkItems.length === 0 && !showNewItemForm && (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <Settings className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-600 text-lg">在这里配置工作模板</p>
                        <p className="text-gray-400 text-sm mt-2">点击"添加模板"开始创建您的第一个工作模板</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fixed" className="mt-8">
              <Card className="backdrop-blur-xl bg-white/90 border-0 shadow-xl rounded-3xl overflow-hidden transition-shadow duration-200 hover:shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-6">
                  <CardTitle className="text-xl font-semibold text-gray-900">固定安排</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setShowNewFixedItemForm(true)}
                    className="h-10 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    添加安排
                  </Button>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  <div className="space-y-4">
                    {/* 添加新固定安排表单 */}
                    {showNewFixedItemForm && (
                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-2xl border-2 border-dashed border-purple-200">
                        {/* 第一行：时间安排 */}
                        <div className="grid grid-cols-5 gap-6 mb-4">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">星期</label>
                            <select
                              value={newFixedItem.schedule.weekday}
                              onChange={(e) => setNewFixedItem({
                                ...newFixedItem,
                                schedule: { ...newFixedItem.schedule, weekday: Number(e.target.value) }
                              })}
                              className="h-10 w-full rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200 px-3"
                            >
                              <option value={1}>周一</option>
                              <option value={2}>周二</option>
                              <option value={3}>周三</option>
                              <option value={4}>周四</option>
                              <option value={5}>周五</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">开始时间（时）</label>
                            <Input
                              type="number"
                              value={newFixedItem.schedule.startHour}
                              onChange={(e) => setNewFixedItem({
                                ...newFixedItem,
                                schedule: { ...newFixedItem.schedule, startHour: Number(e.target.value) }
                              })}
                              placeholder="8"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                              min="8"
                              max="17"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">开始时间（分）</label>
                            <select
                              value={newFixedItem.schedule.startMinute}
                              onChange={(e) => setNewFixedItem({
                                ...newFixedItem,
                                schedule: { ...newFixedItem.schedule, startMinute: Number(e.target.value) }
                              })}
                              className="h-10 w-full rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200 px-3"
                            >
                              <option value={0}>00</option>
                              <option value={30}>30</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">结束时间（时）</label>
                            <Input
                              type="number"
                              value={newFixedItem.schedule.endHour}
                              onChange={(e) => setNewFixedItem({
                                ...newFixedItem,
                                schedule: { ...newFixedItem.schedule, endHour: Number(e.target.value) }
                              })}
                              placeholder="9"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                              min="8"
                              max="17"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">结束时间（分）</label>
                            <select
                              value={newFixedItem.schedule.endMinute}
                              onChange={(e) => setNewFixedItem({
                                ...newFixedItem,
                                schedule: { ...newFixedItem.schedule, endMinute: Number(e.target.value) }
                              })}
                              className="h-10 w-full rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200 px-3"
                            >
                              <option value={0}>00</option>
                              <option value={30}>30</option>
                            </select>
                          </div>
                        </div>

                        {/* 第二行：工作信息 */}
                        <div className="grid grid-cols-4 gap-6 mb-4">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作性质</label>
                            <Input
                              value={newFixedItem.workNature}
                              onChange={(e) => setNewFixedItem({...newFixedItem, workNature: e.target.value})}
                              placeholder="输入工作性质"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作类别</label>
                            <Input
                              value={newFixedItem.workType}
                              onChange={(e) => setNewFixedItem({...newFixedItem, workType: e.target.value})}
                              placeholder="输入工作类别"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">内容属性</label>
                            <Input
                              value={newFixedItem.contentType}
                              onChange={(e) => setNewFixedItem({...newFixedItem, contentType: e.target.value})}
                              placeholder="输入内容属性"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作形式</label>
                            <Input
                              value={newFixedItem.workForm}
                              onChange={(e) => setNewFixedItem({...newFixedItem, workForm: e.target.value})}
                              placeholder="输入工作形式"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                            />
                          </div>
                        </div>

                        {/* 第三行：其他信息 */}
                        <div className="grid grid-cols-3 gap-6 mb-6">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">备注</label>
                            <Input
                              value={newFixedItem.remarks}
                              onChange={(e) => setNewFixedItem({...newFixedItem, remarks: e.target.value})}
                              placeholder="输入备注"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">共同完成人</label>
                            <Input
                              value={newFixedItem.collaborator}
                              onChange={(e) => setNewFixedItem({...newFixedItem, collaborator: e.target.value})}
                              placeholder="输入共同完成人"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">描述</label>
                            <Input
                              value={newFixedItem.description}
                              onChange={(e) => setNewFixedItem({...newFixedItem, description: e.target.value})}
                              placeholder="输入工作描述"
                              className="h-10 rounded-xl border-gray-200 bg-white focus:border-purple-400 transition-all duration-200"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-3">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowNewFixedItemForm(false);
                              setNewFixedItem({
                                id: Date.now(),
                                description: '',
                                workNature: '',
                                workType: '',
                                contentType: '',
                                workForm: '',
                                remarks: '',
                                collaborator: '',
                                schedule: {
                                  weekday: 1,
                                  startHour: 8,
                                  startMinute: 0,
                                  endHour: 9,
                                  endMinute: 0
                                }
                              });
                            }}
                            className="h-10 px-6 rounded-xl border-gray-200 hover:bg-gray-50 transition-all duration-200"
                          >
                            取消
                          </Button>
                          <Button
                            onClick={addFixedItem}
                            className="h-10 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-200"
                          >
                            确定
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 已添加的固定时段工作内容列表 */}
                    {fixedWorkItems.map((item) => (
                      <div key={item.id} 
                        className="bg-gradient-to-r from-white to-purple-50 p-6 rounded-2xl border border-purple-200 transition-all duration-300 hover:border-purple-300 hover:shadow-lg"
                      >
                        {/* 第一行：时间安排 */}
                        <div className="grid grid-cols-5 gap-6 mb-4">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">星期</label>
                            <select
                              value={item.schedule.weekday}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { 
                                    ...i, 
                                    schedule: { ...i.schedule, weekday: Number(e.target.value) }
                                  } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 w-full rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200 px-3"
                            >
                              <option value={1}>周一</option>
                              <option value={2}>周二</option>
                              <option value={3}>周三</option>
                              <option value={4}>周四</option>
                              <option value={5}>周五</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">开始时间（时）</label>
                            <Input
                              type="number"
                              value={item.schedule.startHour}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { 
                                    ...i, 
                                    schedule: { ...i.schedule, startHour: Number(e.target.value) }
                                  } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                              min="8"
                              max="17"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">开始时间（分）</label>
                            <select
                              value={item.schedule.startMinute}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { 
                                    ...i, 
                                    schedule: { ...i.schedule, startMinute: Number(e.target.value) }
                                  } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 w-full rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200 px-3"
                            >
                              <option value={0}>00</option>
                              <option value={30}>30</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">结束时间（时）</label>
                            <Input
                              type="number"
                              value={item.schedule.endHour}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { 
                                    ...i, 
                                    schedule: { ...i.schedule, endHour: Number(e.target.value) }
                                  } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                              min="8"
                              max="17"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">结束时间（分）</label>
                            <select
                              value={item.schedule.endMinute}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { 
                                    ...i, 
                                    schedule: { ...i.schedule, endMinute: Number(e.target.value) }
                                  } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 w-full rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200 px-3"
                            >
                              <option value={0}>00</option>
                              <option value={30}>30</option>
                            </select>
                          </div>
                        </div>

                        {/* 第二行：工作信息 */}
                        <div className="grid grid-cols-4 gap-6 mb-4">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作性质</label>
                            <Input
                              value={item.workNature}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { ...i, workNature: e.target.value } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作类别</label>
                            <Input
                              value={item.workType}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { ...i, workType: e.target.value } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">内容属性</label>
                            <Input
                              value={item.contentType}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { ...i, contentType: e.target.value } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">工作形式</label>
                            <Input
                              value={item.workForm}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { ...i, workForm: e.target.value } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                        </div>

                        {/* 第三行：其他信息和删除按钮 */}
                        <div className="grid grid-cols-4 gap-6">
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">备注</label>
                            <Input
                              value={item.remarks}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { ...i, remarks: e.target.value } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">共同完成人</label>
                            <Input
                              value={item.collaborator}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { ...i, collaborator: e.target.value } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium text-gray-700 mb-2">描述</label>
                            <Input
                              value={item.description}
                              onChange={(e) => {
                                const updatedItems = fixedWorkItems.map(i => 
                                  i.id === item.id ? { ...i, description: e.target.value } : i
                                );
                                setFixedWorkItems(updatedItems);
                              }}
                              className="h-10 rounded-xl border-gray-200 bg-white/80 focus:bg-white transition-all duration-200"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFixedWorkItems(fixedWorkItems.filter(i => i.id !== item.id));
                              }}
                              className="w-full h-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-all duration-200"
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* 空状态提示 */}
                    {fixedWorkItems.length === 0 && !showNewFixedItemForm && (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <Clock className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-gray-600 text-lg">配置固定的工作安排</p>
                        <p className="text-gray-400 text-sm mt-2">设置每周固定的工作时间和班次</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="weekend" className="mt-8">
              <Card className="backdrop-blur-xl bg-white/90 border-0 shadow-xl rounded-3xl overflow-hidden transition-shadow duration-200 hover:shadow-2xl">
                <CardHeader className="pb-6">
                  <CardTitle className="text-xl font-semibold text-gray-900">周末讲堂配置</CardTitle>
                  <p className="text-sm text-gray-600 mt-2">左侧配置讲堂模板，右侧选择本月需要进行讲堂的周六日期</p>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* 左侧：模板配置 */}
                    <div className="xl:col-span-2 space-y-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                          <Settings className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">讲堂模板配置</h3>
                      </div>
                      
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">工作性质</label>
                            <Input
                              value={weekendLectureTemplate.workNature}
                              onChange={(e) => setWeekendLectureTemplate({
                                ...weekendLectureTemplate,
                                workNature: e.target.value
                              })}
                              className="h-11 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">工作类别</label>
                            <Input
                              value={weekendLectureTemplate.workType}
                              onChange={(e) => setWeekendLectureTemplate({
                                ...weekendLectureTemplate,
                                workType: e.target.value
                              })}
                              className="h-11 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">内容属性</label>
                            <Input
                              value={weekendLectureTemplate.contentType}
                              onChange={(e) => setWeekendLectureTemplate({
                                ...weekendLectureTemplate,
                                contentType: e.target.value
                              })}
                              className="h-11 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">工作形式</label>
                            <Input
                              value={weekendLectureTemplate.workForm}
                              onChange={(e) => setWeekendLectureTemplate({
                                ...weekendLectureTemplate,
                                workForm: e.target.value
                              })}
                              className="h-11 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                            <Input
                              value={weekendLectureTemplate.remarks}
                              onChange={(e) => setWeekendLectureTemplate({
                                ...weekendLectureTemplate,
                                remarks: e.target.value
                              })}
                              className="h-11 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">共同完成人</label>
                            <Input
                              value={weekendLectureTemplate.collaborator}
                              onChange={(e) => setWeekendLectureTemplate({
                                ...weekendLectureTemplate,
                                collaborator: e.target.value
                              })}
                              className="h-11 rounded-xl border-gray-200 bg-white focus:border-blue-400 transition-all duration-200"
                            />
                          </div>
                        </div>
                        
                        <div className="p-4 bg-blue-100 rounded-xl">
                          <h4 className="text-sm font-medium text-blue-900 mb-3">时间安排</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-2">开始小时</label>
                              <Input
                                type="number"
                                value={weekendLectureTemplate.startHour}
                                onChange={(e) => setWeekendLectureTemplate({
                                  ...weekendLectureTemplate,
                                  startHour: Number(e.target.value)
                                })}
                                className="h-9 rounded-lg border-blue-200 bg-white focus:border-blue-400 text-center text-sm"
                                min="8"
                                max="17"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-2">开始分钟</label>
                              <select
                                value={weekendLectureTemplate.startMinute}
                                onChange={(e) => setWeekendLectureTemplate({
                                  ...weekendLectureTemplate,
                                  startMinute: Number(e.target.value)
                                })}
                                className="h-9 w-full rounded-lg border-blue-200 bg-white focus:border-blue-400 text-center text-sm px-2"
                              >
                                <option value={0}>00</option>
                                <option value={30}>30</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-2">结束小时</label>
                              <Input
                                type="number"
                                value={weekendLectureTemplate.endHour}
                                onChange={(e) => setWeekendLectureTemplate({
                                  ...weekendLectureTemplate,
                                  endHour: Number(e.target.value)
                                })}
                                className="h-9 rounded-lg border-blue-200 bg-white focus:border-blue-400 text-center text-sm"
                                min="8"
                                max="17"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-2">结束分钟</label>
                              <select
                                value={weekendLectureTemplate.endMinute}
                                onChange={(e) => setWeekendLectureTemplate({
                                  ...weekendLectureTemplate,
                                  endMinute: Number(e.target.value)
                                })}
                                className="h-9 w-full rounded-lg border-blue-200 bg-white focus:border-blue-400 text-center text-sm px-2"
                              >
                                <option value={0}>00</option>
                                <option value={30}>30</option>
                              </select>
                            </div>
                          </div>
                          <p className="text-xs text-blue-600 mt-2">
                            当前时间安排：周六 {weekendLectureTemplate.startHour}:{weekendLectureTemplate.startMinute.toString().padStart(2, '0')}-{weekendLectureTemplate.endHour}:{weekendLectureTemplate.endMinute.toString().padStart(2, '0')}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* 右侧：日期选择 */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                          <Calendar className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">本月周六</h3>
                      </div>
                      
                      <div className="space-y-3">
                        {getSaturdaysInMonth().length > 0 ? (
                          getSaturdaysInMonth().map((saturday) => (
                            <div 
                              key={saturday.date}
                              className={`p-3 rounded-xl border-2 transition-all duration-200 hover:shadow-md ${
                                saturday.enabled 
                                  ? 'border-blue-300 bg-blue-50' 
                                  : 'border-gray-200 bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm ${
                                    saturday.enabled 
                                      ? 'bg-blue-500 text-white' 
                                      : 'bg-gray-300 text-gray-600'
                                  }`}>
                                    {saturday.day}
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900 text-sm">
                                      {selectedMonth}月{saturday.day}日
                                    </p>
                                    <p className="text-xs text-gray-600">
                                      {saturday.enabled ? '进行讲堂' : '休息'}
                                    </p>
                                  </div>
                                </div>
                                
                                <button
                                  onClick={() => {
                                    const newLectures = [...weekendLectures];
                                    const existingIndex = newLectures.findIndex(lecture => lecture.date === saturday.date);
                                    
                                    if (existingIndex >= 0) {
                                      newLectures[existingIndex].enabled = !saturday.enabled;
                                    } else {
                                      newLectures.push({
                                        date: saturday.date,
                                        enabled: !saturday.enabled
                                      });
                                    }
                                    
                                    setWeekendLectures(newLectures);
                                  }}
                                  className={`w-11 h-6 rounded-full transition-all duration-200 relative ${
                                    saturday.enabled 
                                      ? 'bg-blue-500' 
                                      : 'bg-gray-300'
                                  }`}
                                >
                                  <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 absolute top-1 ${
                                    saturday.enabled ? 'translate-x-6' : 'translate-x-1'
                                  }`} />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6">
                            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                              <Calendar className="w-5 h-5 text-gray-400" />
                            </div>
                            <p className="text-gray-600 text-sm">本月没有周六</p>
                          </div>
                        )}
                      </div>
                      
                      {getSaturdaysInMonth().length > 0 && (
                        <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <Check className="w-2 h-2 text-white" />
                            </div>
                            <h4 className="text-xs font-medium text-green-900">统计</h4>
                          </div>
                          <p className="text-xs text-green-700">
                            共 {getSaturdaysInMonth().length} 个周六，安排 {getSaturdaysInMonth().filter(s => s.enabled).length} 次讲堂
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Toast提示 */}
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
}
