import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "./index.css";
import "./styles.css";

/** 把运行时错误直接渲染到页面上，避免白屏 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    // 同时打到控制台，方便你复制第一条红错
    console.error("❌ React render crashed:", error);
    console.error("❌ Component stack:", info?.componentStack);
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      const msg = String(e?.stack || e?.message || e);

      return (
        <div
          style={{
            padding: 24,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          <h2 style={{ margin: "0 0 12px 0" }}>App crashed 💥</h2>
          <div style={{ opacity: 0.8, marginBottom: 12 }}>
            打开 DevTools Console 也能看到同样错误（第一条红色最关键）
          </div>
          <pre style={{ margin: 0 }}>{msg}</pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}

/** 兜底：捕获非 React 渲染阶段错误 */
window.addEventListener("error", (ev) => {
  console.error("❌ window.error:", ev.error || ev.message);
});
window.addEventListener("unhandledrejection", (ev: any) => {
  console.error("❌ unhandledrejection:", ev.reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);