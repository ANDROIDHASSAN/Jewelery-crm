import { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, Heart, ShoppingBag, MapPin, Phone, Mail, Package, Clock, CheckCircle2, Truck, XCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { signIn, signOut } from '@/features/storefront/shopSlice';
import { useListOrdersByPhoneQuery } from '@/features/storefront/storefrontApi';
import { Money } from '@/components/ui/money';

const STATUS_LABEL: Record<string, { label: string; tone: string; Icon: typeof Clock }> = {
  PENDING:   { label: 'Pending',    tone: 'bg-warning-50 text-warning-700 border-warning-100', Icon: Clock },
  CONFIRMED: { label: 'Confirmed',  tone: 'bg-info-50 text-info-700 border-info-100', Icon: CheckCircle2 },
  PACKED:    { label: 'Packed',     tone: 'bg-info-50 text-info-700 border-info-100', Icon: Package },
  SHIPPED:   { label: 'In transit', tone: 'bg-info-50 text-info-700 border-info-100', Icon: Truck },
  DELIVERED: { label: 'Delivered',  tone: 'bg-success-50 text-success-700 border-success-100', Icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled',  tone: 'bg-ink-50 text-ink-600 border-ink-100', Icon: XCircle },
  RETURNED:  { label: 'Returned',   tone: 'bg-ink-50 text-ink-600 border-ink-100', Icon: XCircle },
};

export function AccountPage(): JSX.Element {
  const account = useAppSelector((s) => s.shop.account);
  const wishlistCount = useAppSelector((s) => s.shop.wishlist.length);
  const cartCount = useAppSelector((s) => s.shop.cart.length);
  const dispatch = useAppDispatch();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  if (!account.signedIn) {
    return (
      <div className="max-w-md w-full mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="mx-auto h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center">
          <User className="h-6 w-6 text-brand-700" />
        </div>
        <h1 className="font-display text-2xl sm:text-[32px] text-ink-900 text-center mt-6">Welcome back</h1>
        <p className="text-center text-sm text-ink-600 mt-2">
          Sign in to track orders, save favourites, and reserve appointments at the showroom.
        </p>
        <form
          className="mt-8 sm:mt-10 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !phone.trim()) return;
            dispatch(signIn({ name: name.trim(), email: email.trim(), phone: phone.trim() }));
          }}
        >
          <Field label="Name" value={name} onChange={setName} placeholder="Your name" required />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="98xxxxxxxx" required />
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <button
            type="submit"
            className="w-full h-12 rounded-full bg-brand-400 text-ink-900 text-sm font-medium hover:bg-brand-300 transition-colors"
          >
            Continue
          </button>
          <p className="text-[11px] text-ink-500 text-center leading-relaxed">
            By continuing you agree to our <Link to="/store/terms" className="underline decoration-ink-200 underline-offset-4">terms</Link> and <Link to="/store/privacy" className="underline decoration-ink-200 underline-offset-4">privacy policy</Link>.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 md:py-14">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <p className="text-eyebrow uppercase text-ink-500">Your account</p>
          <h1 className="font-display text-2xl sm:text-[34px] md:text-[40px] text-ink-900 mt-2">Hi, {account.name.split(' ')[0]}</h1>
          <p className="text-sm text-ink-600 mt-2 break-words">Signed in as {account.phone}{account.email ? ` · ${account.email}` : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => dispatch(signOut())}
          className="self-start sm:self-auto inline-flex items-center gap-2 h-10 px-5 rounded-full border border-ink-200 text-sm text-ink-700 hover:bg-ink-50 transition-colors shrink-0"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </header>

      <MyOrders phone={account.phone} wishlistCount={wishlistCount} cartCount={cartCount} />

      <section className="mt-8 sm:mt-10 rounded-md border border-ink-100 bg-ink-25 p-5 sm:p-6">
        <p className="text-eyebrow uppercase text-ink-500">Contact details</p>
        <ul className="mt-4 space-y-3 text-sm text-ink-800">
          <li className="flex items-center gap-3"><User className="h-4 w-4 text-ink-500" />{account.name}</li>
          <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-ink-500" />{account.phone}</li>
          {account.email && <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-ink-500" />{account.email}</li>}
        </ul>
      </section>
    </div>
  );
}

function MyOrders({
  phone,
  wishlistCount,
  cartCount,
}: {
  phone: string;
  wishlistCount: number;
  cartCount: number;
}): JSX.Element {
  // Poll every 20s while the account page is open so a status change pushed
  // from admin shows up without a refresh. Skip entirely if the customer
  // hasn't given us a phone (the lookup is phone-keyed).
  const { data: orders = [], isLoading } = useListOrdersByPhoneQuery(
    { phone },
    { skip: !phone, pollingInterval: 20_000 },
  );

  const open = orders.filter((o) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(o.status));
  const inTransit = orders.filter((o) => o.status === 'SHIPPED');

  return (
    <>
      <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Tile
          to="/store/wishlist"
          icon={<Heart className="h-4 w-4 text-brand-700" />}
          label="Wishlist"
          value={`${wishlistCount} ${wishlistCount === 1 ? 'piece' : 'pieces'}`}
        />
        <Tile
          to="/store/cart"
          icon={<ShoppingBag className="h-4 w-4 text-brand-700" />}
          label="Bag"
          value={`${cartCount} ${cartCount === 1 ? 'piece' : 'pieces'}`}
        />
        <Tile
          to={inTransit.length === 1 ? `/store/track/${inTransit[0]!.id.slice(-6).toUpperCase()}` : '/store/track'}
          icon={<MapPin className="h-4 w-4 text-brand-700" />}
          label="In transit"
          value={inTransit.length > 0 ? `${inTransit.length} on the way` : open.length > 0 ? `${open.length} open` : 'None'}
        />
      </div>

      <section className="mt-8 sm:mt-10">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-eyebrow uppercase text-ink-500">My orders</h2>
          {orders.length > 0 && (
            <span className="text-xs text-ink-500">{orders.length} total</span>
          )}
        </header>
        {isLoading && (
          <p className="text-sm text-ink-500">Loading your orders…</p>
        )}
        {!isLoading && orders.length === 0 && (
          <div className="rounded-md border border-ink-100 bg-ink-0 p-6 text-center">
            <Package className="h-6 w-6 text-ink-400 mx-auto" />
            <p className="text-sm text-ink-700 mt-3">No orders yet.</p>
            <p className="text-xs text-ink-500 mt-1">
              Place your first order and it&apos;ll show up here automatically.
            </p>
            <Link
              to="/store/collections/bridal"
              className="inline-block mt-4 h-10 px-5 rounded-full bg-ink-900 text-ink-0 text-xs font-medium leading-[2.5rem]"
            >
              Browse collections
            </Link>
          </div>
        )}
        {orders.length > 0 && (
          <ul className="space-y-2">
            {orders.map((o) => {
              // Both lookups are guaranteed by the STATUS_LABEL definition
              // (PENDING is a literal key), but TS strict index access can't
              // see through the Record<string, …> indexer. Non-null assert.
              const meta = STATUS_LABEL[o.status] ?? STATUS_LABEL.PENDING!;
              const Icon = meta.Icon;
              const firstImage = o.items.find((i) => i.product?.images?.[0])?.product?.images?.[0];
              const titleLine =
                o.items.length === 1
                  ? o.items[0]!.product?.name ?? 'Piece'
                  : `${o.items[0]!.product?.name ?? 'Piece'} + ${o.items.length - 1} more`;
              return (
                <li key={o.id}>
                  <Link
                    to={`/store/track/${o.id.slice(-6).toUpperCase()}`}
                    className="flex items-center gap-4 rounded-md border border-ink-100 bg-ink-0 p-4 hover:border-ink-300 transition-colors"
                  >
                    {firstImage ? (
                      <img src={firstImage} alt="" className="h-14 w-14 rounded object-cover bg-ink-50" />
                    ) : (
                      <div className="h-14 w-14 rounded bg-ink-50 flex items-center justify-center">
                        <Package className="h-5 w-5 text-ink-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-900 truncate">{titleLine}</p>
                      <p className="font-mono text-xs text-ink-500 mt-0.5">
                        ZL-{o.id.slice(-6).toUpperCase()} &middot;{' '}
                        {new Date(o.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border ${meta.tone}`}
                    >
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    <Money paise={o.totalPaise} className="font-mono tabular-nums text-sm text-ink-900 w-24 text-right" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}): JSX.Element {
  return (
    <label className="block">
      <span className="text-eyebrow uppercase text-ink-500 block mb-2">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full h-12 px-4 bg-ink-25 rounded-md border border-ink-100 text-sm text-ink-900 placeholder:text-ink-400 focus:bg-ink-0 focus:border-brand-300 outline-none transition-colors"
      />
    </label>
  );
}

function Tile({ to, icon, label, value }: { to: string; icon: React.ReactNode; label: string; value: string }): JSX.Element {
  return (
    <Link to={to} className="block rounded-md border border-ink-100 bg-ink-0 p-5 hover:border-ink-300 transition-colors">
      <div className="h-8 w-8 rounded-full bg-brand-50 inline-flex items-center justify-center">{icon}</div>
      <p className="mt-4 text-eyebrow uppercase text-ink-500">{label}</p>
      <p className="text-lg text-ink-900 mt-1">{value}</p>
    </Link>
  );
}
