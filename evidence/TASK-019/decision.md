# TASK-019 evidence decision

保留亮色主题下 `#atmosphere { opacity: .35 }` 的全局策略。Cloud、rain、snow、fog、storm 的亮色材质已经按场景降低饱和度和不透明度；统一的 0.35 继续提供同一层级的背景装饰强度。SunScene 现在用 `this.lightTheme` 为 moon、halo、sun 和 star material 提供亮色分支，因此 clear-night 的材质本身保持浅色，即使经过 0.35 合成也不会成为深底上的灰团。

“两个月亮”保留：右上 WMO 图标继续表达当前天气，左侧 3D 月亮只作为低存在感环境装饰。亮色 `#c4ccd6` 的材质亮度由 `light-night.cjs` 通过 CDP 实测为 `0.598`（阈值 `> 0.55`）。
