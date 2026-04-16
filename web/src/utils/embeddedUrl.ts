function getBaseUri() {
  if (typeof document !== "undefined" && document.baseURI) {
    return document.baseURI;
  }

  return "http://localhost/";
}

export function getEmbeddedDocumentUrl(): URL {
  return new URL(getBaseUri());
}

export function getEmbeddedSearchParams(): URLSearchParams {
  return new URLSearchParams(getEmbeddedDocumentUrl().search);
}

export function resolveEmbeddedUrl(pathOrUrl: string): URL {
  return new URL(pathOrUrl, getEmbeddedDocumentUrl());
}
