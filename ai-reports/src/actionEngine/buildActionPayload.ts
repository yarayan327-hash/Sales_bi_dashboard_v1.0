export function buildActionPayload(input: {
  report_date: string;
  unreached_leads: any[];
  preclass_unfollowed: any[];
  postclass_unfollowed: any[];
  sales_todo: any[];
  group_mentions: any[];
}) {
  return {
    generated_at: new Date().toISOString(),
    report_date: input.report_date,
    unreached_leads: input.unreached_leads,
    preclass_unfollowed: input.preclass_unfollowed,
    postclass_unfollowed: input.postclass_unfollowed,
    sales_todo: input.sales_todo,
    group_mentions: input.group_mentions,
  };
}