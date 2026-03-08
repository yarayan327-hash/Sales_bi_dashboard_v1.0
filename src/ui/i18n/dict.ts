export type Lang = "zh" | "en";

export const DICT: Record<Lang, Record<string, string>> = {
  zh: {
    app_title: "销售数据系统",
    tab1: "Tab1 日报",
    tab2: "Tab2 长尾追踪",
    settings: "设置",
    lang: "语言",
    report_date: "日期",

    m1_title: "模块一｜本月收入 MTD Revenue",
    m2_title: "模块二｜销售外呼情况 Calling Discipline",
    m3_title: "模块三｜体验课转化情况 Trial Conversion",
    m4_title: "模块四｜过程指标 Process KPI",
    m5_title: "模块五｜长尾转化 MTD Tail Conversion",
    m6_title: "模块六｜MTD目标达成系统 Target Achievement",

    mtd_gmv: "当月GMV",
    daily_gmv: "当日GMV",
    daily_orders: "当日订单数",

    empty: "暂无数据",
    data_ok: "数据已加载",
    data_missing: "缺少数据文件",
    reload: "刷新",
  },
  en: {
    app_title: "Sales BI Dashboard",
    tab1: "Tab1 Daily",
    tab2: "Tab2 Tail Follow-up",
    settings: "Settings",
    lang: "Language",
    report_date: "Report Date",

    m1_title: "Module 1 | MTD Revenue",
    m2_title: "Module 2 | Calling Discipline",
    m3_title: "Module 3 | Trial Conversion",
    m4_title: "Module 4 | Process KPI",
    m5_title: "Module 5 | MTD Tail Conversion",
    m6_title: "Module 6 | MTD Target Achievement",

    mtd_gmv: "MTD GMV",
    daily_gmv: "Daily GMV",
    daily_orders: "Daily Orders",

    empty: "No data",
    data_ok: "Data loaded",
    data_missing: "Missing data files",
    reload: "Reload",
  },
};
