# 键盘走通主流程

2026-10-03，Edge，无鼠标操作；真实前端，API 使用固定验收数据和已登录测试会话。

## 375px

1. Tab × 1 → #search-input（焦点环 2px solid）
2. Tab × 2 → button.search-item（焦点环 2px solid）
3. Space 选择南京 → #city=南京，天气和 7 天预报已渲染
4. Tab × 7 → #temperature（焦点环 2px solid）
5. Space → 72°F；Enter → 22°，localStorage 单位与显示同步
6. Tab × 28 → #fav-btn（焦点环 2px solid）
7. Enter 收藏南京 → 实际 POST /api/favorites；提交中 opacity=.45 / not-allowed，完成 aria-pressed=true
8. Tab × 19 → .tab-btn[data-tab="chat"]（焦点环 2px solid）
9. Enter → 出行建议 tab，主流程完成（操作全程无鼠标、无 focus()/click()）
10. Tab × 10 → .tab-btn[data-tab="home"]（焦点环 2px solid）
11. Tab × 9 → .recent-chip（焦点环 2px solid）
12. Enter 最近城市 → 上海天气
13. Tab × 4 → .day-row（焦点环 2px solid）
14. Space 展开当天详情 → Enter 收起，aria-expanded 与可见性同步
15. Tab × 7 → .advice-chip（焦点环 2px solid）
16. Tab × 1 → #chat-send（焦点环 2px solid）
17. Space 建议标签 → 带入问题并聚焦聊天输入 → Tab + Enter 发送，收到回复
18. Tab × 3 → .tab-btn[data-tab="guide"]（焦点环 2px solid）
19. Tab × 4 → .guide-tab[data-guide="travel"]（焦点环 2px solid）
20. Tab × 1 → .tab-btn[data-tab="home"]（焦点环 2px solid）
21. Tab × 8 → #map-btn（焦点环 2px solid）
22. Tab × 0 → #map-close（焦点环 2px solid）
23. Enter 打开原生 modal → Tab 未进入背景控件 → 在关闭按钮按 Esc 关闭 → 焦点回 #map-btn

## 768px

1. Tab × 1 → #search-input（焦点环 2px solid）
2. Tab × 2 → button.search-item（焦点环 2px solid）
3. Space 选择南京 → #city=南京，天气和 7 天预报已渲染
4. Tab × 7 → #temperature（焦点环 2px solid）
5. Space → 72°F；Enter → 22°，localStorage 单位与显示同步
6. Tab × 28 → #fav-btn（焦点环 2px solid）
7. Enter 收藏南京 → 实际 POST /api/favorites；提交中 opacity=.45 / not-allowed，完成 aria-pressed=true
8. Tab × 19 → .tab-btn[data-tab="chat"]（焦点环 2px solid）
9. Enter → 出行建议 tab，主流程完成（操作全程无鼠标、无 focus()/click()）
10. Tab × 10 → .tab-btn[data-tab="home"]（焦点环 2px solid）
11. Tab × 9 → .recent-chip（焦点环 2px solid）
12. Enter 最近城市 → 上海天气
13. Tab × 4 → .day-row（焦点环 2px solid）
14. Space 展开当天详情 → Enter 收起，aria-expanded 与可见性同步
15. Tab × 7 → .advice-chip（焦点环 2px solid）
16. Tab × 1 → #chat-send（焦点环 2px solid）
17. Space 建议标签 → 带入问题并聚焦聊天输入 → Tab + Enter 发送，收到回复
18. Tab × 3 → .tab-btn[data-tab="guide"]（焦点环 2px solid）
19. Tab × 4 → .guide-tab[data-guide="travel"]（焦点环 2px solid）
20. Tab × 1 → .tab-btn[data-tab="home"]（焦点环 2px solid）
21. Tab × 8 → #map-btn（焦点环 2px solid）
22. Tab × 0 → #map-close（焦点环 2px solid）
23. Enter 打开原生 modal → Tab 未进入背景控件 → 在关闭按钮按 Esc 关闭 → 焦点回 #map-btn

## 1280px

1. Tab × 1 → #search-input（焦点环 2px solid）
2. Tab × 2 → button.search-item（焦点环 2px solid）
3. Space 选择南京 → #city=南京，天气和 7 天预报已渲染
4. Tab × 7 → #temperature（焦点环 2px solid）
5. Space → 72°F；Enter → 22°，localStorage 单位与显示同步
6. Tab × 28 → #fav-btn（焦点环 2px solid）
7. Enter 收藏南京 → 实际 POST /api/favorites；提交中 opacity=.45 / not-allowed，完成 aria-pressed=true
8. Tab × 19 → .tab-btn[data-tab="chat"]（焦点环 2px solid）
9. Enter → 出行建议 tab，主流程完成（操作全程无鼠标、无 focus()/click()）
10. Tab × 10 → .tab-btn[data-tab="home"]（焦点环 2px solid）
11. Tab × 9 → .recent-chip（焦点环 2px solid）
12. Enter 最近城市 → 上海天气
13. Tab × 4 → .day-row（焦点环 2px solid）
14. Space 展开当天详情 → Enter 收起，aria-expanded 与可见性同步
15. Tab × 7 → .advice-chip（焦点环 2px solid）
16. Tab × 1 → #chat-send（焦点环 2px solid）
17. Space 建议标签 → 带入问题并聚焦聊天输入 → Tab + Enter 发送，收到回复
18. Tab × 3 → .tab-btn[data-tab="guide"]（焦点环 2px solid）
19. Tab × 4 → .guide-tab[data-guide="travel"]（焦点环 2px solid）
20. Tab × 1 → .tab-btn[data-tab="home"]（焦点环 2px solid）
21. Tab × 8 → #map-btn（焦点环 2px solid）
22. Tab × 0 → #map-close（焦点环 2px solid）
23. Enter 打开原生 modal → Tab 未进入背景控件 → 在关闭按钮按 Esc 关闭 → 焦点回 #map-btn
