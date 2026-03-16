export type Lang = "zh" | "en";

export const t = (lang: Lang) => {
  const dict = {
    zh: {
      appTitle: "销售数据系统",
      tab1: "Tab1 日报",
      tab2: "Tab2 长尾追踪",
      reportDate: "日期",
      loadData: "加载数据",
      reloadFromPublic: "从 public/data 读取",
      uploadCsv: "上传 CSV",
      dataStatusReady: "数据已加载",
      dataStatusMissing: "缺少数据：请放到 public/data 或上传",
      empty: "暂无数据",
      module1: "模块一｜本月收入 MTD Revenue",
      module2: "模块二｜销售外呼情况 Calling Discipline",
      module3: "模块三｜体验课转化情况 Trial Conversion",
      module4: "模块四｜过程指标 Process KPI",
      module5: "模块五｜长尾转化 MTD Tail Conversion",
      module6: "模块六｜MTD目标达成系统 MTD Target Achievement",
      mtdControl: "MTD 控制中心",
      lang: "语言"
    },
    en: {
      appTitle: "Sales BI System",
      tab1: "Tab1 Daily",
      tab2: "Tab2 Follow-up",
      reportDate: "Date",
      loadData: "Load Data",
      reloadFromPublic: "Load from public/data",
      uploadCsv: "Upload CSV",
      dataStatusReady: "Data loaded",
      dataStatusMissing: "Missing data: put CSVs in public/data or upload",
      empty: "No data",
      module1: "Module 1 | MTD Revenue",
      module2: "Module 2 | Calling Discipline",
      module3: "Module 3 | Trial Conversion",
      module4: "Module 4 | Process KPI",
      module5: "Module 5 | MTD Tail Conversion",
      module6: "Module 6 | MTD Target Achievement",
      mtdControl: "MTD Control Center",
      lang: "Lang"
    }
  } as const;

  return dict[lang];
};
