import type { ReactNode } from "react";

export type MockRole =
  | "Administrator"
  | "Manager"
  | "Cashier"
  | "Kitchen Staff"
  | "Waiter"
  | "Delivery Rider"
  | "Customer";

export interface MockRestaurantInfo {
  id: string;
  name: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  deliveryRadiusKm: number;
  isOpen: boolean;
  acceptsDelivery: boolean;
  policies: {
    cancellationWindowMins: number;
    depositPerGuestAbove4: number;
    minDeliveryAmount: number;
    baseDeliveryFee: number;
    perKmFeeAfter3km: number;
  };
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: MockRole;
  avatar: string;
  status: string;
  vehicle?: string;
}

export interface MockMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  image: string;
  isAvailable: boolean;
  preparationTimeMins: number;
  variants: Array<{ name: string; priceAdjustment: number }>;
  addOns: Array<{ name: string; price: number }>;
}

export interface MockTable {
  id: string;
  tableNumber: string;
  seats: number;
  zone: string;
  status: "Available" | "Occupied" | "Cleaning" | "Reserved";
  currentSessionId: string | null;
  elapsedMins?: number;
  guestCount?: number;
  estReadyInMins?: number;
  reservationName?: string;
  reservationTime?: string;
}

export interface MockOrderItem {
  name: string;
  qty: number;
  variant: string;
  addOns: string[];
  price: number;
}

export interface MockOrder {
  id: string;
  orderType: "Dine-In" | "Delivery" | "Pickup";
  tableNumber: string | null;
  customerName: string;
  customerPhone?: string;
  address?: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  elapsedMinutes: number;
  riderAssigned?: string;
  items: MockOrderItem[];
  subtotal: number;
  serviceCharge?: number;
  deliveryFee?: number;
  tax: number;
  total: number;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export interface StatusBadgeProps {
  status: string;
}

export interface ResponsiveDataTableProps {
  orders: readonly MockOrder[];
  onView: (order: MockOrder) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "right" | "left" | "bottom";
}

export interface StatePanelProps {
  state: "loading" | "empty" | "error" | "success";
  title?: string;
  description?: string;
  onRetry?: () => void;
}
