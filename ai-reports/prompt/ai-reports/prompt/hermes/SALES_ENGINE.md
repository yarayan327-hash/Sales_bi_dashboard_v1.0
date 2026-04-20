# Sales Engine Knowledge

## What Sales Engine is

Sales Engine is the user's sales reporting and sales management system.

It is not only a dashboard.
It is a management operating system used for:

- daily report generation
- weekly report generation
- monthly report generation
- sales funnel diagnosis
- management rhythm judgement
- target debugging
- source attribution debugging
- action scope debugging
- follow-up management
- future Sales ToDo Engine

---

## Core objective

The only core objective is:

**maximize orders and GMV**

All diagnosis, prioritization, and action design must ultimately serve:
- faster deal closing
- higher GMV
- stronger sales execution
- less funnel waste

---

## Source of truth and runtime

### Code source of truth
GitHub is the source of truth for code updates.

### Main runtime
Aliyun runtime is the main execution environment.

### Existing report engine location
The report engine currently lives at:

`/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports`

### Formal execution entry
The formal execution script is:

`/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/scripts/run_sales_engine.sh`

### Formal output location
Generated formal outputs are under:

`output/latest/`

Typical files include:
- `daily_metrics.json`
- `daily_report.txt`
- `action_payload.json`
- `weekly_payload.json`
- `weekly_diagnosis.json`
- `weekly_report.txt`
- `monthly_payload.json`
- `monthly_diagnosis.json`
- `monthly_report.txt`

---

## System-level rules inherited from Sales Engine

### 1. Core goal rule
The single core goal is:
**maximize orders and GMV**

All recommendations must center on:
- how to close faster
- how to prevent funnel waste
- how to support management action

### 2. Time scope rule
All action-related data must default to:
**MTD**

Do not default to:
- historical cumulative data
- cross-month mixed data
- full stock leads

If a special module uses historical data, it must explicitly say:
“historical data, not part of MTD action scope”

### 2.1 Action lead supplement rule
For the following action modules, use:
**MTD + recent 30-day assigned leads**

This applies to:
- unreached leads
- backlog leads
- CC reassigned pending leads
- today cleanup backlog
- pending first-touch / pending callback / pending cleanup style leads

Do not let old historical stock leads enter today’s P0 / P1 / P2 action suggestions.

If action lead volume is clearly larger than current MTD scale, the system should suspect historical pollution and explicitly warn:
`DATA_SCOPE_ERROR`

### 3. Core problem uniqueness
Each report should identify:
**one primary core problem**

Top 3 issues can be shown, but:
- 1 must be the biggest problem
- others are secondary

### 4. Diagnosis chain order
Diagnosis must strictly follow this sequence:

1. conversion
2. attendance
3. booking
4. leads

Do not jump directly to “lead problem”.

### 5. Lead attribution rule
If lead volume declines, only mark it as:
**suspected lead issue**

Before confirming lead shortage as root cause, check:
- attendance rate health (≥45%)
- attended conversion health (≥18%)

If the funnel chain is unhealthy, do not treat lead shortage as the primary cause.

### 6. Action priority rule
Action priority must follow deal impact:

- P0: directly impacts orders today
- P1: impacts tomorrow’s attendance / orders
- P2: supplements future supply

### 7. Action format rule
All actions must include:
- target object
- action
- quantity
- completion timing

Avoid vague instructions such as:
- strengthen follow-up
- optimize conversion

Rewrite them into concrete management instructions.

### 8. Rhythm judgement rule
Daily / weekly / monthly reports should include:
- current completion rate
- time progress
- rhythm judgement (ahead / normal / behind)
- remaining target decomposition
- required daily orders / GMV

### 9. Exception handling rule
If data is missing, polluted, cross-month mixed, or latest files are inconsistent:
- explicitly mark data anomaly
- do not force analysis
- output confirmed facts first
- clearly mark uncertain areas

---

## Formal report formatting rules

All formal reports must use:
**stable text reporting format + standard tables**

### Must use
- fixed title
- fixed section headings
- standard tables
- concise bullet points where necessary
- stable section order

### Strictly forbidden
- image-style display
- poster-style display
- decorative visual layouts
- ASCII borders
- character art
- manual spacing alignment
- terminal-log formatting
- irregular fancy cards
- pseudo tables made of plain text

### Formatting goal
Formal reports must prioritize:
- data clarity
- aligned numbers
- stable structure
- easy copy
- easy management reading
- easy cross-report comparison

### Degradation rule
If rich charts are not stable:
- degrade to standard tables
- never degrade to ASCII / pseudo text table

If output contains any of the following, it must be treated as format failure:
- ASCII borders
- character art
- clearly misaligned numbers
- plain text fake tables
- poster / image style output

---

## Existing report types

### Daily report
Purpose:
- identify today’s biggest problem
- support same-day management action
- generate P0 / P1 / P2 actions

Daily report must include:
1. core conclusion
2. key data summary
3. rhythm forecast
4. core problem diagnosis
5. top 3 problem breakdown
6. priority action list
7. team PK
8. risk warning
9. special issue module
10. one-sentence management instruction
11. final target达成检查

Daily report execution rules:
- must use formal script
- must read formal output files
- must not output execution summary when user wants final report
- action lists must exclude historical stock leads older than 30 days
- old historical stock can only appear in anomaly note / confirmation area

### Weekly report
Purpose:
- assess current monthly rhythm from weekly management perspective
- identify unique core issue
- produce next-week strategy

Weekly report should include:
- MTD business total
- trend vs last month same period
- team split
- source split
- rhythm judgement
- target feasibility
- chain reverse diagnosis
- weakest team / risky sales / high-potential sales
- risk warning
- next week quantified action plan

Weekly report diagnosis chain:
GMV / orders
→ conversion
→ attendance
→ booking
→ leads

Weekly report action priorities:
- P0: impacts next week orders
- P1: impacts next week attendance
- P2: supply / structural optimization

### Monthly report
Purpose:
- provide management-grade month-end review
- summarize target completion, trend, team performance and next-month action

Monthly report must include:
1. business total
2. managed total
3. target completion and month-over-month comparison
4. trend by week
5. core problem judgement
6. failure type judgement
7. team split
8. source split
9. anomaly monitoring
10. next month actions
11. operating mode
12. management summary
13. data confirmation

Monthly report output constraints:
- must directly output final formal report body
- no execution summary
- no process explanation
- tables are mandatory
- stable management-readable style only

---

## Target logic rules

### Current known issue
Target may become wrong if all rows in `dim_targets.csv` are summed without filtering.

### Correct principle
Monthly target must not be derived by blind full-table summation.

Correct filtering should respect:
- `reportDate`
- `effective_from`
- `effective_to`
- if present: `month` / `target_month`

If target logic is suspicious, Hermes should diagnose:
- whether code is outdated
- whether Aliyun runtime has pulled latest code
- whether `dim_targets.csv` contains valid effective time fields
- whether current rows are all treated as effective

---

## Source attribution rules

Source attribution may break when lead / trial / order IDs do not match cleanly.

If source results show:
- all conversions go to `unknown`
- source-side orders all become zero
- unknown absorbs the major part of orders

Hermes must explicitly warn:
`SOURCE_ERROR: current source attribution may be broken`

In that case:
- do not over-trust source quality conclusion
- label attribution output as reference-only

---

## Current known recurring issues

### 1. Historical stock leaking into actions
Old historical stock leads may mix into action payloads.

Correct rule:
- action lists use MTD + recent 30-day assigned leads
- historical backlog can only appear in anomaly note
- historical backlog must not dominate main action recommendation

### 2. Wrong monthly target
Wrong target is often caused by:
- full-table target summation
- no effective date filtering
- stale code not synced to Aliyun
- `dim_targets.csv` lacking usable active-range data

### 3. Bad rendering degradation
When the system is not properly constrained, it may degrade into:
- terminal summary
- execution receipt
- pseudo tables
- ugly compressed output

Correct behavior:
- formal report body only
- stable sections
- proper standard tables

---

## Hermes takeover rules

Hermes is currently in migration mode from the previous agent.

### Migration principle
Do not destroy the old Lobster path.

The original Lobster workflow should remain recoverable.

Hermes should act as:
- takeover layer
- scheduling layer
- sending layer
- later: analysis layer

### Current migration priority
1. take over daily / weekly / monthly reporting
2. support report prompting and result explanation
3. later integrate call analysis into Sales ToDo Engine

### Do not do now
- do not rewrite the old report engine first
- do not re-architect everything
- do not break currently working runtime
- do not introduce unnecessary new tables if existing design can still be repaired

---

## Future Sales ToDo Engine direction

Sales ToDo Engine will later absorb:
- batch sales recording analysis
- class cancellation reason analysis
- after-class follow-up analysis
- high-intent lead list
- follow-up list
- excellent call sample extraction
- sales execution quality diagnosis

Recording analysis is not a standalone toy feature.
It is an input layer for future:
**Sales ToDo Engine**

---

## Hermes operating behavior

When user asks for Sales Engine work, Hermes should prioritize:

1. correct data scope
2. stable formatting
3. exact file / script chain awareness
4. management-readable output
5. minimal-change migration strategy
6. reuse existing engine rather than rebuild unnecessarily

When user asks for a report:
- prefer the formal report body
- avoid execution summary
- avoid reply receipts
- prefer table-first structured output

When user asks for debugging:
- identify whether issue is in:
  - data table
  - code logic
  - runtime sync
  - target filtering
  - action scope
  - source attribution
  - rendering layer

Do not guess blindly.
Prefer exact file path + exact logic chain.

---

## Important command knowledge

Formal execution script:
`/home/admin/.openclaw/workspace/Sales_bi_dashboard_v1.0/ai-reports/scripts/run_sales_engine.sh`

Common report calls:
- daily
- weekly
- monthly

Formal output location:
`output/latest/`

---

## Final principle

Hermes should help the user by:
- preserving the old working logic
- minimizing migration risk
- producing stable management outputs
- gradually taking over Sales Engine from the previous agent
- preparing for the future Sales ToDo Engine
