// Shared DOM safety policy for live rendering, template bindings, and SSR.

export type AttributeValue = string | number | boolean | null;

const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;
const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "cite",
  "background",
  "srcset",
]);
const TAG_SCOPED_URL_ATTRIBUTES = new Map<string, Set<string>>([
  ["object", new Set(["data"])],
]);
const URL_PROPERTY_ATTRIBUTES = new Map([
  ["href", "href"],
  ["src", "src"],
  ["action", "action"],
  ["formaction", "formaction"],
  ["xlinkhref", "xlink:href"],
  ["poster", "poster"],
  ["cite", "cite"],
  ["background", "background"],
  ["srcset", "srcset"],
  ["data", "data"],
]);
const SAFE_URL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const BLOCKED_ATTRIBUTES = new Set(["srcdoc"]);
const BLOCKED_PROPERTIES = new Set(["innerhtml", "outerhtml", "srcdoc"]);

const SAFE_DATA_IMAGE_URL =
  /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=\s]+$/i;

export const isValidAttributeName = (name: string): boolean =>
  ATTRIBUTE_NAME.test(name);

export const isBlockedAttributeName = (name: string): boolean => {
  const normalized = name.toLowerCase();
  return !isValidAttributeName(name) || normalized.startsWith("on") || BLOCKED_ATTRIBUTES.has(normalized);
};

export const isBlockedPropertyName = (name: string): boolean => {
  const normalized = name.toLowerCase();
  return normalized.startsWith("on") || BLOCKED_PROPERTIES.has(normalized);
};

const normalizeTagName = (tagName?: string): string | undefined =>
  tagName?.toLowerCase();

const isUrlAttribute = (name: string, tagName?: string): boolean => {
  const normalized = name.toLowerCase();
  if (URL_ATTRIBUTES.has(normalized)) return true;

  const scoped = TAG_SCOPED_URL_ATTRIBUTES.get(normalizeTagName(tagName) ?? "");
  return scoped?.has(normalized) ?? false;
};

const sanitizeSrcset = (value: string): string | null => {
  const candidates = value.split(",");
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed === "") return null;
    const url = trimmed.split(/\s+/, 1)[0];
    if (!isSafeUrl(url)) return null;
  }
  return value;
};

const isSafeUrl = (value: string): boolean => {
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "");
  const scheme = normalized.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  if (!scheme) return true;

  const protocol = scheme[1].toLowerCase();
  if (SAFE_URL_SCHEMES.has(protocol)) return true;
  if (protocol === "data") return SAFE_DATA_IMAGE_URL.test(normalized);
  return false;
};

export const sanitizeAttributeValue = (
  name: string,
  value: AttributeValue,
  tagName?: string,
): string | null => {
  if (isBlockedAttributeName(name)) return null;
  if (value === null || value === false) return null;

  const rendered = value === true ? "" : String(value);
  if (isUrlAttribute(name, tagName)) {
    if (name.toLowerCase() === "srcset") return sanitizeSrcset(rendered);
    if (!isSafeUrl(rendered)) return null;
  }
  return rendered;
};

export const urlAttributeForProperty = (name: string): string | null =>
  URL_PROPERTY_ATTRIBUTES.get(name.toLowerCase()) ?? null;

export const sanitizeUrlPropertyValue = (
  propertyName: string,
  value: unknown,
  tagName?: string,
): { attrName: string; value: string } | null | undefined => {
  const attrName = urlAttributeForProperty(propertyName);
  if (attrName === null) return undefined;
  if (value === null || value === undefined || value === false) return null;

  const sanitized = sanitizeAttributeValue(
    attrName,
    value === true ? true : String(value),
    tagName,
  );
  return sanitized === null
    ? null
    : { attrName, value: sanitized };
};

export const escapeHTML = (input: unknown): string =>
  String(input).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

export const escapeStyleTagContent = (css: string): string =>
  css.replace(/<\/style/gi, "<\\/style");

export const encodeHydrationKey = (key: string): string =>
  encodeURIComponent(key).replace(/-/g, "%2D");

export const decodeHydrationKey = (key: string): string => {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
};
