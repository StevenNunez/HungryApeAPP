'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, Banknote, CreditCard, Smartphone, CheckCircle2, Loader2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { useCart } from '@/hooks/useCart';
import { formatCLP } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createOrder as supabaseCreateOrder, getEffectivePlan } from '@/lib/data';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NicknameSuggester } from './NicknameSuggester';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

type Step = 'cart' | 'payment';

// Payment method config
type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr';

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
            id: 'qr',
            label: 'App / QR',
            icon: <Smartphone className="h-5 w-5" />,
            instruction: 'Paga directamente con tu aplicación favorita y muestra la confirmación.',
            badge: 'Digital'
        },
    ];

export function Cart() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>('cart');
    const [nickname, setNickname] = useState('');
    const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [tenantPlan, setTenantPlan] = useState<string>('gratis');

    const { cartItems, removeFromCart, updateQuantity, clearCart, cartTotal } = useCart();
    const router = useRouter();
    const { toast } = useToast();

    // Extract tenantSlug from URL
    const pathParts = typeof window !== 'undefined' ? window.location.pathname.split('/') : [];
    const mIndex = pathParts.indexOf('m');
    const tenantSlug = mIndex !== -1 ? pathParts[mIndex + 1] : 'hungry-ape-demo';

    useEffect(() => {
        if (open && tenantSlug) {
            const supabase = createClient();
            supabase
                .from('tenants')
                .select('plan_id, subscription_status, trial_ends_at')
                .eq('slug', tenantSlug)
                .single()
                .then(({ data }) => {
                    const d = data as any;
                    if (d) setTenantPlan(getEffectivePlan(d));
                });
        }
    }, [open, tenantSlug]);

    // Filter payment methods based on plan
    const visiblePaymentMethods = PAYMENT_METHODS.filter(method => {
        if (tenantPlan === 'gratis' || tenantPlan === 'starter') {
            return method.id === 'cash' || method.id === 'transfer';
        }
        return true; // card + qr only for pro/enterprise
    });

    const reset = () => {
        setStep('cart');
        setNickname('');
        setSelectedPayment(null);
        setIsConfirming(false);
    };

    const handleOpenChange = (v: boolean) => {
        setOpen(v);
        if (!v) reset();
    };

    const handleGoToPayment = () => {
        if (!nickname.trim()) {
            toast({
                title: 'Apodo requerido',
                description: 'Por favor, ingresa un apodo para identificarte.',
                variant: 'destructive',
            });
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
            const order = await supabaseCreateOrder(tenantSlug, nickname, cartItems, cartTotal, selectedPayment);

            toast({
                title: '¡Pedido enviado a cocina! 🍳',
                description: `Identificador: ${order.shortId ? '#' + order.shortId : 'ID:' + order.id.slice(0, 8)}. ¡Prepárate!`,
            });

            clearCart();
            handleOpenChange(false);
            router.push(`/m/${tenantSlug}/pedido/${order.id}?code=${order.pickupCode}`);
        } catch (err: any) {
            console.error('Order error:', err);
            const isLimitReached = err.message?.includes('LIMIT_REACHED');

            toast({
                title: isLimitReached ? 'Local muy ocupado 😥' : 'Error al confirmar',
                description: isLimitReached
                    ? 'Este local ha alcanzado el límite de pedidos por hoy. Por favor, realiza tu pago o pide directamente en caja.'
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
                    className="relative border-border hover:border-primary hover:text-primary transition-colors"
                    aria-label="Abrir carrito"
                >
                    <ShoppingCart className="h-4 w-4" />
                    {totalItems > 0 && (
                        <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground animate-bounce shadow-lg">
                            {totalItems}
                        </span>
                    )}
                </Button>
            </SheetTrigger>

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
                    <div className="flex gap-2 mt-2">
                        {(['cart', 'payment'] as Step[]).map((s, i) => (
                            <div key={s} className="flex items-center gap-2">
                                <div
                                    className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${step === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                        }`}
                                >
                                    {i + 1}
                                </div>
                                {i === 0 && <div className="w-4 h-px bg-border" />}
                            </div>
                        ))}
                    </div>
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
                                                    <p className="text-[10px] text-primary/80 mt-0.5 leading-tight">
                                                        {item.selectedModifiers.map(m => m.optionName).join(' · ')}
                                                    </p>
                                                )}
                                                <p className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5 tracking-wider">{item.category}</p>

                                                <div className="flex items-center gap-4 mt-2">
                                                    <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/50">
                                                        <button
                                                            onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}
                                                            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-background transition-colors text-muted-foreground hover:text-primary"
                                                            aria-label="Disminuir cantidad"
                                                        >
                                                            <Minus className="h-3 w-3" />
                                                        </button>
                                                        <span className="w-6 text-center text-[11px] font-bold tabular-nums">{item.quantity}</span>
                                                        <button
                                                            onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}
                                                            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-background transition-colors text-muted-foreground hover:text-primary"
                                                            aria-label="Agregar cantidad"
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                        </button>
                                                    </div>

                                                    <button
                                                        onClick={() => removeFromCart(item.cartKey)}
                                                        className="text-muted-foreground/50 hover:text-destructive transition-colors"
                                                        aria-label={`Eliminar ${item.name}`}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold tracking-tight">{formatCLP((item.price + item.modifierPrice) * item.quantity)}</p>
                                                {item.modifierPrice > 0 && (
                                                    <p className="text-[10px] text-muted-foreground">{formatCLP(item.price)} base</p>
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
                                    <div className="relative">
                                        <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="cart-nickname"
                                            placeholder="¿Tu apodo?"
                                            value={nickname}
                                            onChange={(e) => setNickname(e.target.value)}
                                            className="bg-muted border-0 h-12 pl-10 rounded-xl focus:ring-2 ring-primary/20 transition-all font-medium"
                                        />
                                    </div>
                                    <NicknameSuggester onNicknameSelect={setNickname} />
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
                                    Siguiente paso
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
                                <p className="text-[11px] text-muted-foreground mt-1">Selecciona cómo pagarás al retirar:</p>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {visiblePaymentMethods.map((method) => {
                                    const isSelected = selectedPayment === method.id;
                                    return (
                                        <button
                                            key={method.id}
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
                                                            <Badge className="bg-primary/20 text-primary hover:bg-primary/20 border-0 text-[10px] h-4 px-1 shadow-none">
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
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Instrucción:</p>
                                    <p className="text-xs font-bold leading-relaxed">{PAYMENT_METHODS.find(m => m.id === selectedPayment)?.instruction}</p>
                                </div>
                            )}

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-muted-foreground uppercase px-1">
                                    <span>{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
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