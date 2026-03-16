import React from "react";
import { Tab2Result } from "../../types/metrics";
import { Table } from "../components/Table";

function fmtPct(v: number | null) {
  if (v === null) return "N/A";
  return `${Math.round(v * 1000) / 10}%`;
}

export function Tab2Page(props: { data: Tab2Result; t: (k: string) => string }) {
  const { data, t } = props;

  return (
    <>
      <div className="section">
        <h2>模块A｜体验课长尾追踪总览</h2>
        <Table
          columns={[
            { key: "class_date", title: "体验课日期" },
            { key: "attended_users", title: "出席用户数" },
            { key: "follow_1h_users", title: "1h跟进用户" },
            { key: "follow_24h_users", title: "24h跟进用户" },
            { key: "follow_48h_users", title: "48h跟进用户" },
            { key: "follow_7d_users", title: "7d跟进用户" },
            { key: "follow_1h_rate", title: "1h跟进率", render: (v) => fmtPct(v) },
            { key: "follow_24h_rate", title: "24h跟进率", render: (v) => fmtPct(v) },
            { key: "follow_48h_rate", title: "48h跟进率", render: (v) => fmtPct(v) },
            { key: "follow_7d_rate", title: "7d跟进率", render: (v) => fmtPct(v) },
          ]}
          rows={data.overview}
          emptyText={t("empty")}
        />
      </div>

      <div className="section">
        <h2>模块B｜销售个人长尾跟进漏斗</h2>
        <Table
          columns={[
            { key: "sales_agent", title: "销售(目前为agent_id)" },
            { key: "class_date", title: "体验课日期" },
            { key: "attended", title: "出席" },
            { key: "follow_1h", title: "1h跟进" },
            { key: "follow_24h", title: "24h跟进" },
            { key: "follow_48h", title: "48h跟进" },
            { key: "follow_7d", title: "7d跟进" },
            { key: "lost_24h", title: "24h流失" },
          ]}
          rows={data.by_agent}
          emptyText={t("empty")}
        />
        <div className="muted" style={{marginTop:8}}>
          提醒：你定义的“销售归属”规则是用 user_master / leads 去映射销售。这里目前用 agent_id 直接展示，后续可替换为 dim_agents 映射的 sales_name。
        </div>
      </div>

      <div className="section">
        <h2>模块C｜课后转化路径分析</h2>
        <Table
          columns={[
            { key: "class_date", title: "体验课日期" },
            { key: "attended", title: "出席" },
            { key: "follow_1h_and_order", title: "1h跟进+成交" },
            { key: "follow_24h_and_order", title: "24h跟进+成交" },
            { key: "no_follow_but_order", title: "无跟进但成交" },
            { key: "no_follow_no_order", title: "无跟进无成交" },
          ]}
          rows={data.path}
          emptyText={t("empty")}
        />
      </div>

      <div className="section">
        <h2>模块D｜未跟进用户清单（运营追责池）</h2>
        <Table
          columns={[
            { key: "user_id", title: "user_id" },
            { key: "sales_agent", title: "sales_agent" },
            { key: "class_date", title: "class_date" },
            { key: "last_follow_time", title: "last_follow_time" },
            { key: "follow_status", title: "follow_status" },
            { key: "has_order", title: "has_order" },
          ]}
          rows={data.unfollowed}
          emptyText={t("empty")}
        />
      </div>
    </>
  );
}
