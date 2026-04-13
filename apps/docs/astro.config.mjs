import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightOpenAPI, { openAPISidebarGroups } from "starlight-openapi";

export default defineConfig({
  integrations: [
    starlight({
      title: "Data360 Docs",
      description: "API Documentation for Data360 Platform",
      social: {
        github: "https://github.com/datalab360",
      },
      defaultLocale: "en",
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "" },
            { label: "Authentication", slug: "getting-started" },
            { label: "Error Handling", slug: "error-contracts" },
          ],
        },
        ...openAPISidebarGroups,
      ],
      customCss: ["./src/styles/custom.css"],
      plugins: [
        starlightOpenAPI([
          {
            base: "api",
            label: "Data360 API",
            schema: "./src/schemas/openapi.json",
          },
        ]),
      ],
    }),
  ],
});
