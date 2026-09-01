import Script from 'next/script';

/**
 * Google Tag Manager or GA4, whichever the operator configured.
 *
 * Both IDs are read from the environment and both are optional — a self-hosted
 * instance almost certainly wants neither, and unset means *nothing is loaded
 * at all*, not an empty container that still opens a connection to Google. That
 * is the difference between "analytics off" and "analytics off but we still
 * told them you were here".
 *
 * The variables must be `NEXT_PUBLIC_` because the tag runs in the browser, and
 * a measurement ID is not a secret — it is visible in the page source of every
 * site that uses one.
 *
 * `afterInteractive` deliberately: analytics must never sit on the critical
 * path of a page whose whole pitch is that it is fast. If both are set, GTM
 * wins and GA4 is skipped, because loading GA4 directly *and* through a GTM
 * container is the standard way to end up counting every pageview twice.
 */
export default function Analytics() {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

  if (gtmId) {
    return (
      <>
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
        {/* The noscript iframe is part of GTM's documented install. It is inert
            with JavaScript on, and is the only way a no-JS visit is counted. */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
            title="Google Tag Manager"
          />
        </noscript>
      </>
    );
  }

  if (gaId) {
    return (
      <>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
        </Script>
      </>
    );
  }

  return null;
}
