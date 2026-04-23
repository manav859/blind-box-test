/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHOPLINE_APP_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import "i18next";

declare module "i18next" {
  /**
   * support i18next.t("key")
   * @override
   * @see https://www.i18next.com/overview/typescript
   */
  interface CustomTypeOptions {
    defaultNS: "en";
    resources: {
      en: typeof import("./locales/en.json");
    };
  }
}
