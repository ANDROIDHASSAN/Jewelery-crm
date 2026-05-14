import { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, Heart, ShoppingBag, MapPin, Phone, Mail } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { signIn, signOut } from '@/features/storefront/shopSlice';

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
      <div className="max-w-[480px] mx-auto px-6 py-16">
        <div className="mx-auto h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center">
          <User className="h-6 w-6 text-brand-700" />
        </div>
        <h1 className="font-display text-[32px] text-ink-900 text-center mt-6">Welcome back</h1>
        <p className="text-center text-sm text-ink-600 mt-2">
          Sign in to track orders, save favourites, and reserve appointments at the showroom.
        </p>
        <form
          className="mt-10 space-y-4"
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
    <div className="max-w-[960px] mx-auto px-6 py-10 md:py-14">
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="text-eyebrow uppercase text-ink-500">Your account</p>
          <h1 className="font-display text-[34px] md:text-[40px] text-ink-900 mt-2">Hi, {account.name.split(' ')[0]}</h1>
          <p className="text-sm text-ink-600 mt-2">Signed in as {account.phone}{account.email ? ` · ${account.email}` : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => dispatch(signOut())}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-ink-200 text-sm text-ink-700 hover:bg-ink-50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </header>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile to="/store/wishlist" icon={<Heart className="h-4 w-4 text-brand-700" />} label="Wishlist" value={`${wishlistCount} ${wishlistCount === 1 ? 'piece' : 'pieces'}`} />
        <Tile to="/store/cart" icon={<ShoppingBag className="h-4 w-4 text-brand-700" />} label="Bag" value={`${cartCount} ${cartCount === 1 ? 'piece' : 'pieces'}`} />
        <Tile to="/store/track" icon={<MapPin className="h-4 w-4 text-brand-700" />} label="Orders" value="None yet" />
      </div>

      <section className="mt-10 rounded-md border border-ink-100 bg-ink-25 p-6">
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
