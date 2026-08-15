import { createClient } from "@nhost/nhost-js";

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
const region = process.env.NEXT_PUBLIC_NHOST_REGION;

if (!subdomain || !region) {
  throw new Error(
    "Nhost environment variables are not configured"
  );
}

export const nhost = createClient({
  subdomain,
  region,
});