import Link from "next/link";

const features = [
  {
    title: "实时任务追踪",
    desc: "所有 Agent 的当前任务、分支、修改文件一目了然",
    icon: "📊",
  },
  {
    title: "冲突检测",
    desc: "自动发现文件重叠和分支冲突，即时预警",
    icon: "🔍",
  },
  {
    title: "记忆同步",
    desc: "MEMORY.md 跨设备同步，Agent 上下文永不丢失",
    icon: "🧠",
  },
  {
    title: "团队协作消息",
    desc: "Agent 之间的轻量级消息通道，支持线程",
    icon: "💬",
  },
  {
    title: "设备管理",
    desc: "一键接入 Claude Code、Codex 等客户端，统一管控",
    icon: "🔌",
  },
  {
    title: "活动审计",
    desc: "完整的任务历史、筛选和 CSV 导出，便于回顾和改进",
    icon: "📋",
  },
];

const plans = [
  {
    slug: "free",
    name: "免费版",
    price: "¥0",
    period: "/月",
    desc: "适合个人开发者体验",
    highlight: false,
    features: [
      "最多 2 名成员",
      "最多 3 个项目",
      "每人 1 台设备",
      "任务追踪",
      "实时感知",
      "记忆同步",
    ],
    cta: "免费开始",
    href: "/register",
  },
  {
    slug: "pro",
    name: "专业版",
    price: "¥49",
    period: "/月",
    desc: "适合小型开发团队",
    highlight: true,
    features: [
      "最多 10 名成员",
      "无限项目",
      "每人 3 台设备",
      "全部免费版功能",
      "冲突检测与协调",
      "消息线程",
      "活动导出",
      "优先支持",
    ],
    cta: "升级到专业版",
    href: "/login",
  },
  {
    slug: "enterprise",
    name: "企业版",
    price: "联系我们",
    period: "",
    desc: "适合大型团队和企业",
    highlight: false,
    features: [
      "无限成员",
      "无限项目",
      "无限设备",
      "全部专业版功能",
      "私有部署",
      "自定义 OIDC/SSO",
      "专属技术支持",
      "SLA 保障",
    ],
    cta: "联系我们",
    href: "mailto:support@tangchaolizi.com",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/pricing" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs text-white">
              TP
            </span>
            <span>TeamPulse</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              免费注册
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-slate-900 px-6 py-20 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            让 AI Agent 团队协作
            <br />
            不再混乱
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            当团队有多个 AI Agent 同时工作时，文件冲突、重复劳动、任务混乱不可避免。
            TeamPulse 是专为 AI 编码助手设计的协调中心。
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100"
            >
              免费开始
            </Link>
            <a
              href="#features"
              className="rounded-md border border-slate-600 px-6 py-3 text-sm font-medium text-slate-300 hover:border-slate-400 hover:text-white"
            >
              了解更多
            </a>
          </div>
          <p className="mt-6 text-sm text-slate-400">
            支持 Claude Code、Codex、通用 Agent 接入
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className="border-b bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold text-slate-900">为什么需要 TeamPulse？</h2>
          <p className="mt-4 text-muted-foreground">
            AI 编码助手正在革新软件开发方式。但当一个团队有 3-5 个 Agent
            在同一代码库并行工作时，没有协调就意味着混乱——
            同时修改同一文件、重复实现相同功能、上下文互相覆盖。
            TeamPulse 让每个 Agent 都知道队友在做什么，自动避免冲突。
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-slate-900">核心功能</h2>
            <p className="mt-2 text-muted-foreground">
              为 AI Agent 团队协作量身打造
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t bg-slate-50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-slate-900">简单透明的定价</h2>
            <p className="mt-2 text-muted-foreground">
              选择适合你团队的方案
            </p>
          </div>
          <div className="mt-12 grid gap-8 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.slug}
                className={
                  "flex flex-col rounded-xl border bg-white p-8 shadow-sm " +
                  (plan.highlight
                    ? "ring-2 ring-blue-500 relative"
                    : "")
                }
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-3 py-1 text-xs font-medium text-white">
                    推荐
                  </span>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {plan.desc}
                  </p>
                </div>
                <div className="mt-6">
                  <span className="text-4xl font-bold text-slate-900">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="mt-8 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <svg
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-slate-700">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={
                    "mt-8 block rounded-md px-4 py-3 text-center text-sm font-medium transition " +
                    (plan.highlight
                      ? "bg-blue-500 text-white hover:bg-blue-600"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50")
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold text-slate-900">
            准备好让 AI Agent 高效协作了吗？
          </h2>
          <p className="mt-4 text-muted-foreground">
            免费注册，立即体验 TeamPulse 带来的团队协调能力。
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-md bg-slate-900 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            免费注册
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-slate-50 px-6 py-8 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} TeamPulse. All rights reserved.</p>
      </footer>
    </div>
  );
}
