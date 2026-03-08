import React from "react";

export function SettingsPage() {
  return (
    <div className="section">
      <h2>设置 / Settings</h2>
      <div className="muted">
        当前版本为纯前端读 /public/data 的 CSV。<br/>
        未来部署服务器时也建议先保持静态托管，再考虑引入后端（避免500/CORS回归）。
      </div>

      <hr className="sep"/>

      <div className="muted">
        ✅ 已内置：fact_trials 的 “YYYY-MM-DD HH:mm ~ HH:mm” 自动解析 + 跨天处理。<br/>
        ✅ 已规避：CORS（无接口） / 500（无后端）<br/>
        ✅ 已支持：中英文切换、品牌色 UI<br/>
      </div>
    </div>
  );
}
