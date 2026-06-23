import CartClient from "@/components/cart-client";

export const metadata = { title: "カート" };

export default function CartPage() {
  return (
    <div className="theme-online frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CART</span>
        <span>Shopping Cart</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-8">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">カート</h1>
        <p className="text-[14px] text-muted mt-2">
          複数の 3DGS データをまとめて購入できます。
        </p>
      </header>

      <CartClient />
    </div>
  );
}
