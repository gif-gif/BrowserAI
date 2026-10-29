export function RetentionSettings() {
  return (
    <section className="settings-card settings-card--compact" aria-labelledby="retention-title">
      <div>
        <p className="eyebrow">对话记录</p>
        <h2 id="retention-title">保留 30 天</h2>
        <p>普通会话按最后更新时间自动清理；置顶会话永久保留。完整管理将在聊天历史中提供。</p>
      </div>
      <span className="status-badge">默认</span>
    </section>
  );
}
