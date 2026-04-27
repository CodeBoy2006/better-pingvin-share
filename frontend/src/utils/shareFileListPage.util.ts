import { GetServerSidePropsContext } from "next";

const apiUrl = process.env.API_URL || "http://localhost:8080";

export async function proxyShareFileListResponse(
  context: GetServerSidePropsContext,
) {
  return proxyShareListResponse(context, {
    apiPath: "files.json",
    accept: "application/json",
    fallbackContentType: "application/json; charset=utf-8",
  });
}

export async function proxySharePlainTextFileListResponse(
  context: GetServerSidePropsContext,
) {
  return proxyShareListResponse(context, {
    apiPath: "files.txt",
    accept: "text/plain",
    fallbackContentType: "text/plain; charset=utf-8",
  });
}

async function proxyShareListResponse(
  context: GetServerSidePropsContext,
  options: {
    apiPath: string;
    accept: string;
    fallbackContentType: string;
  },
) {
  context.res.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  context.res.setHeader("Expires", "0");
  context.res.setHeader("Pragma", "no-cache");
  context.res.setHeader("Vary", "Cookie");
  context.res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const shareId = encodeURIComponent(String(context.params?.shareId || ""));
  const queryString = context.resolvedUrl.includes("?")
    ? context.resolvedUrl.slice(context.resolvedUrl.indexOf("?"))
    : "";

  const upstreamResponse = await fetch(
    `${apiUrl}/api/shares/${shareId}/${options.apiPath}${queryString}`,
    {
      headers: {
        Accept: options.accept,
        Cookie: context.req.headers.cookie || "",
      },
    },
  );

  const responseBody = await upstreamResponse.text();
  const getSetCookie = (
    upstreamResponse.headers as Headers & {
      getSetCookie?: () => string[];
    }
  ).getSetCookie;
  const setCookies =
    typeof getSetCookie === "function"
      ? getSetCookie.call(upstreamResponse.headers)
      : [];
  const cacheControl = upstreamResponse.headers.get("cache-control");
  const vary = upstreamResponse.headers.get("vary");
  const robots = upstreamResponse.headers.get("x-robots-tag");

  context.res.statusCode = upstreamResponse.status;
  context.res.setHeader(
    "Content-Type",
    upstreamResponse.headers.get("content-type") || options.fallbackContentType,
  );

  if (cacheControl) {
    context.res.setHeader("Cache-Control", cacheControl);
  }

  if (vary) {
    context.res.setHeader("Vary", vary);
  }

  if (robots) {
    context.res.setHeader("X-Robots-Tag", robots);
  }

  if (setCookies.length > 0) {
    context.res.setHeader("Set-Cookie", setCookies);
  }

  context.res.end(responseBody);

  return {
    props: {},
  };
}
