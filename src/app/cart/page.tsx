import CartClient from "@/components/cart-client";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Cart" : "カート" };
}

export default async function CartPage() {
  const en = (await getLocale()) === "en";
  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CART</span>
        <span>Shopping Cart</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-8">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">{en ? "Cart" : "カート"}</h1>
        <p className="text-[14px] text-muted mt-2">
          {en
            ? "Buy multiple 3DGS data sets together."
            : "複数の 3DGS データをまとめて購入できます。"}
        </p>
      </header>

      <CartClient />
    </div>
  );
}
