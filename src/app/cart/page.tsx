import CartClient from "@/components/cart-client";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Cart" : "カート" };
}

export default async function CartPage() {
  const en = (await getLocale()) === "en";
  return (
    <div className="theme-online frame ui-page-shell pb-12 sm:pb-32">
      <header className="ui-page-header">
        <h1 className="serif ui-page-title">{en ? "Cart" : "カート"}</h1>
        <p className="ui-page-lead text-[14px] text-muted">
          {en
            ? "Buy multiple 3DGS data sets together."
            : "複数の 3DGS データをまとめて購入できます。"}
        </p>
      </header>

      <CartClient />
    </div>
  );
}
