import MarketingChrome from '@/components/marketing/MarketingChrome';
import { getAppSettings } from '@/lib/app-settings';

/**
 * Server component so the registration policy is read once per request and
 * rendered into the first HTML. See MarketingChrome for why that matters.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const settings = await getAppSettings();
  return <MarketingChrome initialPolicy={settings}>{children}</MarketingChrome>;
}
