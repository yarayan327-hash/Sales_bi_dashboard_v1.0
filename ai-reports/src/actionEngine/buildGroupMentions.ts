export function buildGroupMentions(input: { salesTodo: any[] }) {
  const salesTodo = Array.isArray(input.salesTodo) ? input.salesTodo : [];

  return salesTodo
    .filter((r) => r.total_todo_count > 0)
    .map((r) => {
      const parts: string[] = [];
      if (r.unreached_count > 0) parts.push(`未接通线索 ${r.unreached_count} 个`);
      if (r.preclass_count > 0) parts.push(`课前待跟进 ${r.preclass_count} 个`);
      if (r.postclass_count > 0) parts.push(`课后待跟进 ${r.postclass_count} 个`);

      return {
        sales_group: r.sales_group,
        sales_agent: r.sales_agent,
        mention_text: `@${r.sales_agent} 今日待处理：${parts.join("，")}`,
      };
    });
}