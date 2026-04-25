// ============ Subscription DTOs ============

export interface SubscriptionPlanDto {
    id: string;
    name: string;
    priceUsd: number;
    stripePriceId?: string;
    razorpayPlanId?: string;
    chatLimit?: number;
    isActive: boolean;
    createdAt: Date;
}

export interface UserSubscriptionDto {
    id: string;
    userId: number;
    planId: string;
    provider?: string;
    providerSubscriptionId?: string;
    status: string;
    currentPeriodEnd?: Date;
    createdAt: Date;
    plan?: SubscriptionPlanDto;
}

export interface SubscriptionListDto {
    subscriptions: UserSubscriptionDto[];
    total: number;
    currentPage: number;
    pageSize: number;
}

// ============ Payment DTOs ============

export interface PaymentDto {
    id: string;
    userId: number;
    provider: string;
    providerPaymentId?: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: Date;
}

export interface PaymentHistoryDto {
    payments: PaymentDto[];
    total: number;
    currentPage: number;
    pageSize: number;
}

export interface PaymentReceiptDto {
    id: string;
    transactionId: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    description: string;
    userEmail: string;
    userName: string;
    date: Date;
}

// ============ Subscription Checkout DTOs ============

export interface InitiateCheckoutDto {
    planId: string;
    provider: 'stripe' | 'razorpay';
    redirectUrl?: string;
}

export interface CheckoutSessionDto {
    sessionId: string;
    url: string;
    provider: string;
    expiresAt: Date;
}

// ============ Webhook DTOs ============

export interface StripeWebhookPayloadDto {
    type: string;
    data: {
        object: any;
    };
}

export interface RazorpayWebhookPayloadDto {
    event: string;
    payload: {
        subscription?: {
            id: string;
            entity: any;
        };
        payment?: {
            id: string;
            entity: any;
        };
    };
}

// ============ Response DTOs ============

export interface SubscriptionStatusResponseDto {
    status: string;
    isActive: boolean;
    currentPeriodEnd?: Date;
    remainingDays?: number;
    willRenew: boolean;
    plan?: {
        name: string;
        price: number;
        chatLimit?: number;
    };
}

export interface CreatePaymentResponseDto {
    success: boolean;
    message: string;
    data: {
        paymentId: string;
        amount: number;
        status: string;
        provider: string;
        clientSecret?: string; // For Stripe
        orderId?: string; // For Razorpay
        signature?: string; // For Razorpay
    };
}

export interface CouponRedemptionResponseDto {
    success: boolean;
    message: string;
    data: {
        code: string;
        subscriptionId: string;
        status: string;
        expiresAt?: Date;
        alreadyApplied: boolean;
    };
}

export interface CancelSubscriptionResponseDto {
    success: boolean;
    message: string;
    cancelledAt: Date;
    refundAmount?: number;
}

export interface UpgradeSubscriptionResponseDto {
    success: boolean;
    message: string;
    newPlanId: string;
    nextBillingDate: Date;
    proration?: number;
}

export interface UpgradePreviewResponseDto {
    provider: 'stripe' | 'razorpay';
    currentPlanId: string;
    currentPlanName: string;
    newPlanId: string;
    newPlanName: string;
    currentPeriodEnd?: Date;
    proration: {
        ratioRemaining: number;
        oldPlanCreditInrPaise?: number;
        newPlanCostInrPaise?: number;
        finalChargeInrPaise?: number;
        note: string;
    };
}
