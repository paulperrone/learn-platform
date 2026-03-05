export function useMeta(opts: { title: string; description: string }) {
  document.title = `${opts.title} — Learn Platform`;

  setMeta("description", opts.description);
  setMeta("og:title", opts.title, "property");
  setMeta("og:description", opts.description, "property");
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
