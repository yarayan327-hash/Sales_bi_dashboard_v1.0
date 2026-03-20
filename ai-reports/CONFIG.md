# Sales Engine Config Notes

## 当前版本
- Daily: daily_v3
- Weekly: weekly_v1

## 目录说明

### prompt/
存放正式版本 Prompt
- system_rules.md：最高优先级规则
- daily_v3.md：日报版本
- weekly_v1.md：周报版本

### config/
存放可调配置与输出结构说明
- runtime_config.json：阈值、启用版本、时间范围
- output_schema.md：输出结构规范

## 使用原则
1. GitHub 是唯一源头
2. 阿里云是运行副本
3. 任何规则修改，先改 GitHub，再同步阿里云
4. 不覆盖旧版本，只新增新版本
5. 日报行动相关数据必须默认限制在 MTD

## 后续扩展
未来可新增：
- monthly_v1.md
- policy_rules.json
- incentive_rules.json
- execution_tracker.md