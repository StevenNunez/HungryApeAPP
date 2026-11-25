'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, Banknote, CreditCard, Smartphone, CheckCircle2, Loader2, Store, UtensilsCrossed, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCart } from '@/hooks/useCart';
import { formatCLP } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createOrder as supabaseCreateOrder } from '@/lib/data';
import { allowedPaymentMethods } from '@/lib/plans';
import type { OrderType } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NicknameSuggester } from './NicknameSuggester';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

type Step = 'cart' | 'payment';

// Payment method config
type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr' | 'online';

const PAYMENT_METHODS: {
    id: PaymentMethod;
    label: string;
    icon: React.ReactNode;
    instruction: string;
    badge?: string;
}[] = [
        {
            id: 'cash',
            label: 'Efectivo',
            icon: <Banknote className="h-5 w-5" />,
            instruction: 'Acércate con tu ticket a caja y paga en efectivo al retirar tu pedido.',
        },
        {
            id: 'transfer',
            label: 'Transferencia',
            icon: <ArrowRight className="h-5 w-5" />,
            instruction: 'Realiza tu transferencia y muéstranos el comprobante al retirar tu pedido.',
        },
        {
            id: 'card',
            label: 'Tarjeta',
            icon: <CreditCard className="h-5 w-5" />,
            instruction: 'Acércate a caja con tu ticket para pagar con tarjeta de débito o crédito.',
        },
        {
            id: 'online',
            label: 'Pagar online',
            icon: <Smartphone className="h-5 w-5" />,
            instruction: 'Paga ahora con tarjeta de crédito, débito o tu cuenta de Mercado Pago. Tu pedido pasa a cocina apenas se confirme el pago.',
            badge: 'Online'
        },
    ];

export function Cart() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>('cart');
    const [nickname, setNickname] = useState('');
    const [orderType, setOrderType] = useState<OrderType>('aqui');
    const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [tenantPlan, setTenantPlan] = useState<string>('gratis');
    const [onlineEnabled, setOnlineEnabled] = useState(false);
    const [nicknameError, setNicknameError] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const { cartItems, removeFromCart, updateQuantity, clearCart, cartTotal, ordersOpen, payment } = useCart();
    const router = useRouter();
    const { toast } = useToast();

    // Extract tenantSlug from URL
    const pathParts = typeof window !== 'undefined' ? window.location.pathname.split('/') : [];
    const mIndex = pathParts.indexOf('m');
    const tenantSlug = mIndex !== -1 ? pathParts[mIndex + 1] : 'hungry-ape-demo';

    // The menu page sends the plan with the menu (no waiting when the cart opens).
    // Other pages under /m/… (order tracking) fetch it once, in the background.
    useEffect(() => {
        if (payment) {
            setTenantPlan(payment.plan);
            setOnlineEnabled(payment.online);
            return;
        }
        if (!tenantSlug) return;
        let cancelled = false;
        (async () => {
            const { data } = await createClient()
                .from('tenants_public')
                .select('effective_plan, online_payments')
                .eq('slug', tenantSlug)
                .maybeSingle();
            const d = data as any;
            if (cancelled || !d) return;
            if (d.effective_plan) setTenantPlan(d.effective_plan);
            setOnlineEnabled(!!d.online_payments);
        })();
        return () => { cancelled = true; };
    }, [payment, tenantSlug]);

    // Filter payment methods based on plan
    // Same rule as the server (create_order) and the landing: see allowedPaymentMethods
    const allowed = allowedPaymentMethods(tenantPlan, onlineEnabled);
    const visiblePaymentMethods = PAYMENT_METHODS.filter(method => allowed.includes(method.id));

    const reset = () => {
        setStep('cart');
        setNicknameError(false);
        setOrderType('aqui');
        setSelectedPayment(null);
        setIsConfirming(false);
    };

    const handleOpenChange = (v: boolean) => {
        setOpen(v);
        if (!v) reset();
    };

    const handleGoToPayment = () => {
        if (!nickname.trim()) {
            setNicknameError(true);
            document.getElementById('cart-nickname')?.focus();
            return;
        }
        setStep('payment');
    };

    const handleConfirmOrder = async () => {
        if (!selectedPayment) {
            toast({
                title: 'Selecciona un método de pago',
                description: 'Elige cómo quieres pagar tu pedido.',
                variant: 'destructive',
            });
            return;
        }
        setIsConfirming(true);

        try {
            const order = await supabaseCreateOrder(tenantSlug, nickname, cartItems, selectedPayment, orderType);

            const ref = order.shortId ? `#${order.shortId}` : `#${order.id.slice(0, 8)}`;
            toast({
                title: `¡Pedido ${ref} creado! 🦍`,
                description: selectedPayment === 'online'
                    ? 'Te llevamos a pagar. Apenas se confirme el pago, pasa a cocina.'
                    : 'Falta el pago: paga en caja con tu código para que empecemos a cocinar.',
            });

            setNickname('');
            clearCart();
            handleOpenChange(false);

            // Online payment: go straight to Mercado Pago. If it cannot start, the tracking
            // page offers a "Pagar ahora" button for this same order.
            if (selectedPayment === 'online') {
                try {
                    const res = await fetch(`/api/orders/${order.id}/pay`, { method: 'POST' });
                    const json = await res.json();
                    if (res.ok && json.url) {
                        window.location.href = json.url;
                        return;
                    }
                } catch { /* fall through to the tracking page */ }
            }
            router.push(`/m/${tenantSlug}/pedido/${order.id}?code=${order.pickupCode}`);
        } catch (err: any) {
            console.error('Order error:', err);
            const msg: string = err.message ?? '';
            const isLimitReached = msg.includes('LIMIT_REACHED');
            const isOutOfStock = msg.includes('OUT_OF_STOCK') || msg.includes('PRODUCT_NOT_FOUND');
            const isTooMany = msg.includes('TOO_MANY_PENDING');
            const isPaused = msg.includes('ORDERS_PAUSED');

            toast({
                title: isPaused ? 'Pedidos por la app en pausa' : isLimitReached ? 'Local muy ocupado 😥' : isOutOfStock ? 'Producto agotado' : isTooMany ? 'Demasiados pedidos seguidos' : 'Error al confirmar',
                description: isPaused
                    ? 'Este local no está recibiendo pedidos por la app. Puedes pedir directamente en caja.'
                    : isLimitReached
                    ? 'Este local llegó a su límite de pedidos por la app hoy. Puedes pedir directamente en caja.'
                    : isTooMany
                    ? 'Ya tienes pedidos pendientes de pago en este local. Págalos en caja o espera unos minutos antes de pedir de nuevo.'
                    : isOutOfStock
                    ? 'Alguno de los productos de tu carrito se agotó. Revisa el menú y vuelve a intentarlo.'
                    : 'No se pudo crear tu pedido. Inténtalo de nuevo.',
                variant: 'destructive',
            });
            setIsConfirming(false);
        }
    };

    const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className="relative h-11 w-11 border-border hover:border-primary hover:text-primary transition-colors"
                    aria-label={totalItems > 0 ? `Abrir carrito (${totalItems} productos)` : 'Abrir carrito'}
                >
                    <ShoppingCart className="h-5 w-5" />
                    {totalItems > 0 && (
                        <span key={totalItems} className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground animate-in zoom-in-50 duration-300 shadow-lg">
                            {totalItems}
                        </span>
                    )}
                </Button>
            </SheetTrigger>

            {/* Main action of a QR menu: a fixed bar within thumb reach while there's something in the cart */}
            {mounted && ordersOpen && totalItems > 0 && !open && createPortal(
                <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background/95 to-transparent">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl bg-primary px-5 h-14 text-primary-foreground font-bold shadow-xl active:scale-[0.98] transition-transform"
                    >
                        <span className="flex items-center gap-2">
                            <ShoppingCart className="h-5 w-5" />
                            Ver pedido · {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
                        </span>
                        <span className="font-brand text-xl tracking-tight">{formatCLP(cartTotal)}</span>
                    </button>
                </div>,
                document.body,
            )}

            <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
                <SheetHeader className="px-6 py-4 border-b border-border bg-card/10">
                    <div className="flex items-center gap-3">
                        {step === 'payment' && (
                            <button
                                onClick={() => setStep('cart')}
                                className="text-muted-foreground hover:text-foreground transition-colors pr-2"
                                aria-label="Volver al carrito"
                            >
                                <ArrowRight className="h-5 w-5 rotate-180" />
                            </button>
                        )}
                        <SheetTitle className="font-brand text-2xl tracking-wide uppercase">
                            {step === 'cart' ? '🛒 Tu Carrito' : '💳 Pago'}
                        </SheetTitle>
                    </div>
                    <ol className="flex gap-2 mt-2" aria-label="Pasos del pedido">
                        {(['cart', 'payment'] as Step[]).map((s, i) => (
                            <li key={s} className="flex items-center gap-2" aria-current={step === s ? 'step' : undefined}>
                                <div
                                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${step === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                        }`}
                                >
                                    {i + 1}
                                </div>
                                <span className={`text-xs font-semibold ${step === s ? 'text-foreground' : 'text-muted-foreground'}`}>
                                    {s === 'cart' ? 'Tu pedido' : 'Pago'}
                                </span>
                                {i === 0 && <div className="w-4 h-px bg-border" />}
                            </li>
                        ))}
                    </ol>
                </SheetHeader>

                {step === 'cart' && (
                    <>
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            {cartItems.length > 0 ? (
                                <div className="space-y-6">
                                    {cartItems.map((item) => (
                                        <div key={item.cartKey} className="flex gap-4 items-start group animate-in fade-in slide-in-from-right-4 duration-300">
                                            {/* Imagen del Producto */}
                                            <div className="relative h-16 w-16 shrink-0 rounded-xl overflow-hidden shadow-sm border border-border/50">
                                                <Image
                                                    src={item.imageUrl}
                                                    alt={item.name}
                                                    fill
                                                    className="object-cover transition-transform group-hover:scale-110 duration-500"
                                                    sizes="64px"
                                                />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-sm text-foreground leading-tight truncate">{item.name}</h4>
                                                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                                    <p className="text-xs text-primary mt-0.5 leading-tight">
                                                        {item.selectedModifiers.map(m => m.optionName).join(' · ')}
                                                    </p>
                                                )}
                                                <p className="text-xs uppercase font-bold text-muted-foreground mt-0.5 tracking-wider">{item.category}</p>

                                                <div className="flex items-center justify-between gap-3 mt-2">
                                                    <div className="flex items-center bg-muted/50 rounded-xl border border-border/50">
                                                        <button
                                                            onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}
                                                            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-background transition-colors text-foreground hover:text-primary"
                                                            aria-label={item.quantity === 1 ? `Quitar ${item.name}` : `Quitar uno de ${item.name}`}
                                                        >
                                                            <Minus className="h-4 w-4" />
                                                        </button>
                                                        <span className="w-7 text-center text-sm font-bold tabular-nums" aria-live="polite">{item.quantity}</span>
                                                        <button
                                                            onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}
                                                            disabled={item.quantity >= Math.min(item.stock, 10)}
                                                            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-background transition-colors text-foreground hover:text-primary disabled:opacity-40"
                                                            aria-label={`Agregar otro ${item.name}`}
                                                        >
                                                            <Plus className="h-4 w-4" />
                                                        </button>
                                                    </div>

                                                    <button
                                                        onClick={() => removeFromCart(item.cartKey)}
                                                        className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                        aria-label={`Eliminar ${item.name} del pedido`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold tracking-tight">{formatCLP((item.price + item.modifierPrice) * item.quantity)}</p>
                                                {item.modifierPrice > 0 && (
                                                    <p className="text-xs text-muted-foreground">{formatCLP(item.price)} base</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-6 py-12">
                                    <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center animate-pulse">
                                        <span className="text-5xl opacity-50">🛒</span>
                                    </div>
                                    <div>
                                        <p className="text-xl font-brand uppercase tracking-tight text-foreground">Tu carrito está vacío</p>
                                        <p className="text-sm text-muted-foreground mt-1 max-w-[200px] mx-auto">¡El mono tiene hambre! Agrega algo rico del menú.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {cartItems.length > 0 && (
                            <div className="border-t border-border px-6 py-6 space-y-5 bg-card/5 shadow-[0_-8px_24px_rgba(0,0,0,0.05)]">
                                <div className="space-y-3">
                                    {/* Tipo de pedido */}
                                    <div>
                                        <p id="order-type-label" className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 pl-1">¿Cómo lo quieres?</p>
                                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="order-type-label">
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={orderType === 'aqui'}
                                                onClick={() => setOrderType('aqui')}
                                                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all font-semibold text-sm ${
                                                    orderType === 'aqui'
                                                        ? 'border-primary bg-primary/8 text-primary'
                                                        : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                                                }`}
                                            >
                                                <UtensilsCrossed className="h-5 w-5" />
                                                <span>Comer aquí</span>
                                            </button>
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={orderType === 'llevar'}
                                                onClick={() => setOrderType('llevar')}
                                                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all font-semibold text-sm ${
                                                    orderType === 'llevar'
                                                        ? 'border-primary bg-primary/8 text-primary'
                                                        : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                                                }`}
                                            >
                                                <ShoppingBag className="h-5 w-5" />
                                                <span>Para llevar</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Apodo */}
                                    <div>
                                        <label htmlFor="cart-nickname" className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 pl-1">
                                            Tu apodo (así te llamamos al retirar)
                                        </label>
                                        <div className="relative">
                                            <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                            <Input
                                                id="cart-nickname"
                                                placeholder="Ej: Coté, Pancho, Mesa 4"
                                                value={nickname}
                                                onChange={(e) => { setNickname(e.target.value); if (e.target.value.trim()) setNicknameError(false); }}
                                                maxLength={30}
                                                autoComplete="nickname"
                                                aria-invalid={nicknameError}
                                                aria-describedby={nicknameError ? 'cart-nickname-error' : undefined}
                                                className={`bg-muted h-12 pl-10 rounded-xl focus:ring-2 ring-primary/20 transition-all font-medium ${nicknameError ? 'border-2 border-red-700' : 'border-0'}`}
                                            />
                                        </div>
                                        {nicknameError && (
                                            <p id="cart-nickname-error" className="mt-1.5 pl-1 text-sm font-semibold text-red-700">
                                                Escribe un apodo para que te podamos llamar.
                                            </p>
                                        )}
                                    </div>
                                    <NicknameSuggester onNicknameSelect={(n) => setNickname(n.slice(0, 30))} />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-muted-foreground text-xs uppercase font-bold tracking-widest">
                                        <span>Subtotal</span>
                                        <span>{formatCLP(cartTotal)}</span>
                                    </div>
                                    <div className="flex justify-between items-center font-brand text-2xl tracking-tight">
                                        <span>Total</span>
                                        <span className="text-primary">{formatCLP(cartTotal)}</span>
                                    </div>
                                </div>

                                <Button
                                    id="cart-continue-btn"
                                    className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-xl hover:shadow-primary/20 transition-all active:scale-95 gap-2"
                                    onClick={handleGoToPayment}
                                >
                                    Elegir cómo pagar
                                    <ArrowRight className="h-5 w-5" />
                                </Button>
                            </div>
                        )}
                    </>
                )}

                {step === 'payment' && (
                    <>
                        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                            <div className="p-4 bg-muted/40 rounded-2xl border border-border/50 mb-2">
                                <p className="text-sm font-medium text-foreground">
                                    Confirmar pedido para: <span className="text-primary font-bold">{nickname}</span>
                                </p>
                                <p id="payment-label" className="text-xs text-muted-foreground mt-1">Selecciona cómo vas a pagar:</p>
                            </div>

                            <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-labelledby="payment-label">
                                {visiblePaymentMethods.map((method) => {
                                    const isSelected = selectedPayment === method.id;
                                    return (
                                        <button
                                            key={method.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            onClick={() => setSelectedPayment(method.id)}
                                            className={`relative w-full text-left rounded-2xl border-2 p-4 transition-all duration-300 ${isSelected
                                                ? 'border-primary bg-primary/5 shadow-lg'
                                                : 'border-border bg-card hover:border-primary/30'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-300 ${isSelected ? 'bg-primary text-primary-foreground rotate-6' : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {method.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                                            {method.label}
                                                        </span>
                                                        {method.badge && (
                                                            <Badge className="bg-primary/20 text-primary hover:bg-primary/20 border-0 text-xs h-5 px-1.5 shadow-none">
                                                                {method.badge}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                {isSelected && (
                                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="border-t border-border px-6 py-6 space-y-5 bg-card/5">
                            {selectedPayment && (
                                <div className="bg-muted p-4 rounded-xl space-y-1 animate-in zoom-in-95 duration-300">
                                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Cómo pagar:</p>
                                    <p className="text-xs font-bold leading-relaxed">{PAYMENT_METHODS.find(m => m.id === selectedPayment)?.instruction}</p>
                                </div>
                            )}

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-muted-foreground uppercase px-1">
                                    <span>{totalItems} {totalItems === 1 ? 'producto' : 'productos'}</span>
                                    <span>A pagar</span>
                                </div>
                                <div className="flex justify-between items-center font-brand text-3xl tracking-tight">
                                    <span className="text-foreground">Total</span>
                                    <span className="text-primary">{formatCLP(cartTotal)}</span>
                                </div>
                            </div>

                            <Button
                                id="confirm-order-btn"
                                className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98] disabled:opacity-50"
                                onClick={handleConfirmOrder}
                                disabled={isConfirming || !selectedPayment}
                            >
                                {isConfirming ? (
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>🚀 Preparando...</span>
                                    </div>
                                ) : (
                                    '¡Pedir ahora! 🦍'
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}