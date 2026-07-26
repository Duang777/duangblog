const tagIntros: Record<string, string> = {
  后端专栏: "从一次请求出发，记录服务端边界、时序和真实故障。",
  请求过境: "沿着 HTTP 请求往里走，逐段看超时、取消和连接复用。",
  Agent: "拆开 Agent 项目的循环、工具、状态和工程取舍。",
  拆解: "不止看功能，也看代码如何组织、控制面如何落地。",
  Orloj: "围绕 Orloj，记录单 Agent、多 Agent 和控制面的实现。",
  全栈: "把浏览器、服务端和数据层连起来看，不孤立地学技术。",
  学习: "边做边记下来的路径、判断和可复用方法。",
  随笔: "技术之外的零散观察，以及还没长成专栏的想法。",
  开始: "这个博客从哪里出发，以及之后会持续写些什么。",
};

export function getTagIntro(tagName: string): string {
  return tagIntros[tagName] ?? `收在 ${tagName} 下面的文章和公开笔记。`;
}
