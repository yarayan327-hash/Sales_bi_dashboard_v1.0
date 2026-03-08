import { HEADERS } from "../../config/headers";
import { pick } from "../../utils/csv";
import { extractDigits } from "../../utils/text";
import { parseAnyDateToKsa } from "../../utils/time";
import { toNumber } from "../../utils/number";
import { OrderFact } from "../../types/normalized";

// currency SAR -> USD conversion is NOT defined yet; default treat amount as USD already.
// If you want: add fx rate table later.
export function normalizeOrders(rows: Record<string, string>[]): OrderFact[] {
  return rows.map(r => {
    const order_id = pick(r, HEADERS.fact_orders.order_id) || `${Math.random()}`;
    const user_id = extractDigits(pick(r, HEADERS.fact_orders.user_id));
    const sales_name = pick(r, HEADERS.fact_orders.sales_name);

    const amount_raw = pick(r, HEADERS.fact_orders.amount);
    const amount_usd = toNumber(amount_raw);

    const order_time = pick(r, HEADERS.fact_orders.order_time);
    const order_dt_ksa = parseAnyDateToKsa(order_time);

    return { order_id, user_id, sales_name, amount_usd, order_dt_ksa };
  }).filter(x => x.user_id && x.order_dt_ksa);
}
