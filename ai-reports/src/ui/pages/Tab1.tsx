import React from "react";
import { Tab1Result } from "../../types/metrics";
import { Card } from "../components/Card";
import { Table } from "../components/Table";

function fmtPct(v: number | null) {
  if (v === null) return "N/A";
  return `${Math.round(v * 1000) / 10}%`;
}

export function Tab1Page(props: { data: Tab1Result; t: (k: string) => string }) {
  const { data, t } = props;

  return (
    <>
      <div className="section">
        <h2>{t("m1_title")}</h2>
        <div className="grid">
          <Card label={t("mtd_gmv")} value={data.module1.mtd_gmv.toFixed(2)} />
          <Card label={t("daily_gmv")} value={data.module1.daily_gmv.toFixed(2)} />
          <Card label={t("daily_orders")} value={data.module1.daily_orders} />
          <div className="section kpi">
            <div className="label">MTD 控制中心提示</div>
            <div className="sub">模块六的排序已按 progress_gap（偏差）降序 ✅</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>{t("m6_title")}</h2>
        <Table
          columns={[
            { key: "sales_group", title: "组" },
            { key: "sales_agent", title: "销售" },
            { key: "monthly_target", title: "月目标" },
            { key: "actual_mtd", title: "实际MTD" },
            { key: "expected_mtd", title: "理论应完成" },
            { key: "progress_gap", title: "偏差" },
            { key: "progress_rate", title: "达成率", render: (v) => v === null ? "N/A" : fmtPct(v) },
          ]}
          rows={data.module6}
          emptyText={t("empty")}
        />
      </div>

      <div className="section">
        <h2>{t("m2_title")}</h2>
        <Table
          columns={[
            { key: "sales_group", title: "组" },
            { key: "sales_agent", title: "销售" },
            { key: "report_date", title: "外呼日期" },
            { key: "outbound_calls", title: "外呼次数" },
            { key: "outbound_minutes", title: "通话分钟数" },
            { key: "lead_outbound_calls", title: "当日线索外呼" },
            { key: "stock_outbound_calls", title: "库存线索外呼" },
          ]}
          rows={data.module2}
          emptyText={t("empty")}
        />
      </div>

      <div className="section">
        <h2>{t("m3_title")}</h2>
        <Table
          columns={[
            { key: "sales_group", title: "组" },
            { key: "sales_agent", title: "销售" },
            { key: "class_date", title: "体验课日期" },
            { key: "booked", title: "预约" },
            { key: "attended", title: "出席" },
            { key: "pre15_call_users", title: "课前15外呼" },
            { key: "pre15_connected_users", title: "课前接通" },
            { key: "post1h_call_users", title: "课后1h外呼" },
            { key: "post1h_connected_users", title: "课后1h接通" },
            { key: "post_class_remark_users", title: "课后备注" },
            { key: "pre15_reach_rate", title: "课前触达率", render: (v) => fmtPct(v) },
            { key: "pre15_connect_rate", title: "课前接通率", render: (v) => fmtPct(v) },
            { key: "post1h_reach_rate", title: "课后触达率", render: (v) => fmtPct(v) },
            { key: "post1h_connect_rate", title: "课后接通率", render: (v) => fmtPct(v) },
          ]}
          rows={data.module3}
          emptyText={t("empty")}
        />
        <div className="muted" style={{marginTop: 8}}>
          备注：WA/AC 备注口径需要接入 wa 备注表后补齐（你要的话我下一步直接加）。
        </div>
      </div>

      <div className="section">
        <h2>{t("m4_title")}</h2>
        <Table
          columns={[
            { key: "sales_group", title: "组" },
            { key: "sales_agent", title: "销售" },
            { key: "assigned_date", title: "分配日期" },
            { key: "leads", title: "线索数" },
            { key: "outbound_users", title: "外呼触达用户" },
            { key: "connected_users", title: "接通用户数" },
            { key: "effective_connected", title: "有效接通(>=30s)" },
            { key: "booked_users", title: "约课" },
            { key: "attended_users", title: "出席" },
            { key: "outbound_rate", title: "外呼率", render: (v) => fmtPct(v) },
            { key: "connect_rate", title: "接通率", render: (v) => fmtPct(v) },
            { key: "effective_rate", title: "有效接通率", render: (v) => fmtPct(v) },
            { key: "booking_rate", title: "约课率", render: (v) => fmtPct(v) },
            { key: "attendance_rate", title: "出席率", render: (v) => fmtPct(v) },
            { key: "lead_conversion_rate", title: "线索转化率", render: (v) => fmtPct(v) },
          ]}
          rows={data.module4}
          emptyText={t("empty")}
        />
      </div>

      <div className="section">
        <h2>{t("m5_title")}</h2>
        <Table
          columns={[
            { key: "sales_group", title: "组" },
            { key: "sales_agent", title: "销售" },
            { key: "mtd_attended", title: "当月出席" },
            { key: "mtd_1h_call", title: "当月1h外呼" },
            { key: "mtd_24h_call", title: "当月24h外呼" },
            { key: "mtd_48h_call", title: "当月48h外呼" },
            { key: "mtd_7d_call", title: "当月7d外呼" },
            { key: "mtd_orders", title: "当月订单数" },
            { key: "mtd_gmv", title: "当月GMV" },
          ]}
          rows={data.module5}
          emptyText={t("empty")}
        />
      </div>
    </>
  );
}
