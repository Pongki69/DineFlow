// @ts-check
// Supplied visual-test fixtures. Markdown-wrapped image links are normalized to HTTPS URLs.
// These records are isolated from production APIs and never change restaurant settings.

/** @type {import("../design-lab/types").MockRestaurantInfo} */
export const MOCK_RESTAURANT_INFO = {
  id: "outlet_01",
  name: "DineFlow Bistro & Lounge",
  address: "124 Culinary Boulevard, Metro District",
  phone: "+1 (555) 019-2831",
  currency: "USD",
  taxRate: 0.08,
  serviceChargeRate: 0.1,
  deliveryRadiusKm: 12.5,
  isOpen: true,
  acceptsDelivery: true,
  policies: {
    cancellationWindowMins: 15,
    depositPerGuestAbove4: 10.0,
    minDeliveryAmount: 15.0,
    baseDeliveryFee: 3.0,
    perKmFeeAfter3km: 1.0,
  },
};

/** @type {import("../design-lab/types").MockUser[]} */
export const MOCK_USERS = [
  {
    id: "u_01",
    name: "Eleanor Vance",
    email: "admin@dineflow.io",
    role: "Administrator",
    avatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    status: "Active",
  },
  {
    id: "u_02",
    name: "Marcus Chen",
    email: "m.chen@dineflow.io",
    role: "Manager",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    status: "Active",
  },
  {
    id: "u_03",
    name: "Sarah Jenkins",
    email: "cashier.sarah@dineflow.io",
    role: "Cashier",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    status: "Active",
  },
  {
    id: "u_04",
    name: "Chef Gordon K.",
    email: "kitchen@dineflow.io",
    role: "Kitchen Staff",
    avatar:
      "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=150",
    status: "Active",
  },
  {
    id: "u_05",
    name: "David Miller",
    email: "waiter.david@dineflow.io",
    role: "Waiter",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150",
    status: "Active",
  },
  {
    id: "u_06",
    name: "Carlos Rossi",
    email: "rider.carlos@dineflow.io",
    role: "Delivery Rider",
    avatar:
      "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150",
    status: "Online",
    vehicle: "E-Bike",
  },
  {
    id: "u_07",
    name: "Amara Okezie",
    email: "amara.o@gmail.com",
    role: "Customer",
    avatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150",
    status: "Active",
  },
];

/** @type {import("../design-lab/types").MockMenuItem[]} */
export const MOCK_MENU_ITEMS = [
  {
    id: "item_101",
    name: "Truffle Mushroom Risotto",
    category: "Mains",
    price: 24.5,
    description:
      "Arborio rice cooked with wild forest mushrooms, white truffle oil, and aged Parmesan crisps.",
    image: "https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?w=500",
    isAvailable: true,
    preparationTimeMins: 18,
    variants: [
      { name: "Regular Portion", priceAdjustment: 0 },
      { name: "Large Portion", priceAdjustment: 6.0 },
    ],
    addOns: [
      { name: "Extra Truffle Oil", price: 2.5 },
      { name: "Shaved Fresh Truffle", price: 8.0 },
    ],
  },
  {
    id: "item_102",
    name: "Wood-Fired Margherita Pizza",
    category: "Pizza",
    price: 18.0,
    description:
      "San Marzano tomato sauce, fresh buffalo mozzarella, basil leaves, and extra virgin olive oil.",
    image: "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=500",
    isAvailable: true,
    preparationTimeMins: 12,
    variants: [
      { name: "12-inch Crust", priceAdjustment: 0 },
      { name: "16-inch Crust", priceAdjustment: 5.5 },
    ],
    addOns: [
      { name: "Prosciutto di Parma", price: 4.0 },
      { name: "Burrata Ball", price: 5.0 },
    ],
  },
  {
    id: "item_103",
    name: "A5 Wagyu Beef Burger",
    category: "Burgers",
    price: 28.0,
    description:
      "Seared Wagyu patty, caramelized onions, smoked gouda, and truffle aioli on toasted brioche.",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500",
    isAvailable: true,
    preparationTimeMins: 15,
    variants: [
      { name: "Medium Rare", priceAdjustment: 0 },
      { name: "Medium Well", priceAdjustment: 0 },
    ],
    addOns: [
      { name: "Crispy Bacon", price: 2.5 },
      { name: "Side Truffle Fries", price: 4.5 },
    ],
  },
  {
    id: "item_104",
    name: "Artisanal Iced Matcha Latte",
    category: "Beverages",
    price: 6.5,
    description:
      "Ceremonial grade Uji matcha whisked with organic oat milk and house-made vanilla syrup.",
    image: "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500",
    isAvailable: true,
    preparationTimeMins: 4,
    variants: [
      { name: "Iced", priceAdjustment: 0 },
      { name: "Hot", priceAdjustment: 0 },
    ],
    addOns: [{ name: "Extra Matcha Shot", price: 1.5 }],
  },
  {
    id: "item_105",
    name: "Pistachio Basque Cheesecake",
    category: "Desserts",
    price: 9.5,
    description:
      "Creamy burnt Basque cheesecake infused with Bronte pistachio paste and berry compote.",
    image: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500",
    isAvailable: false,
    preparationTimeMins: 2,
    variants: [],
    addOns: [],
  },
];

/** @type {import("../design-lab/types").MockTable[]} */
export const MOCK_TABLES = [
  {
    id: "t_01",
    tableNumber: "T-01",
    seats: 2,
    zone: "Main Dining",
    status: "Available",
    currentSessionId: null,
  },
  {
    id: "t_02",
    tableNumber: "T-02",
    seats: 4,
    zone: "Main Dining",
    status: "Occupied",
    currentSessionId: "sess_801",
    elapsedMins: 42,
    guestCount: 3,
  },
  {
    id: "t_03",
    tableNumber: "T-03",
    seats: 4,
    zone: "Main Dining",
    status: "Cleaning",
    currentSessionId: null,
    estReadyInMins: 5,
  },
  {
    id: "t_04",
    tableNumber: "T-04",
    seats: 6,
    zone: "Patio",
    status: "Reserved",
    currentSessionId: null,
    reservationName: "Dr. Lawson",
    reservationTime: "19:30",
  },
  {
    id: "t_05",
    tableNumber: "T-05",
    seats: 8,
    zone: "VIP Lounge",
    status: "Occupied",
    currentSessionId: "sess_802",
    elapsedMins: 85,
    guestCount: 7,
  },
  {
    id: "t_06",
    tableNumber: "T-06",
    seats: 2,
    zone: "Patio",
    status: "Available",
    currentSessionId: null,
  },
];

/** @type {import("../design-lab/types").MockOrder[]} */
export const MOCK_ORDERS = [
  {
    id: "ord_1001",
    orderType: "Dine-In",
    tableNumber: "T-02",
    customerName: "Table 02 Guest",
    status: "Preparing",
    paymentStatus: "Unpaid",
    createdAt: "2026-10-27T19:42:00Z",
    elapsedMinutes: 14,
    items: [
      {
        name: "A5 Wagyu Beef Burger",
        qty: 2,
        variant: "Medium Rare",
        addOns: ["Side Truffle Fries"],
        price: 32.5,
      },
      {
        name: "Artisanal Iced Matcha Latte",
        qty: 2,
        variant: "Iced",
        addOns: ["Extra Matcha Shot"],
        price: 8.0,
      },
    ],
    subtotal: 81.0,
    serviceCharge: 8.1,
    tax: 6.48,
    total: 95.58,
  },
  {
    id: "ord_1002",
    orderType: "Delivery",
    tableNumber: null,
    customerName: "Sophia Martinez",
    customerPhone: "+1 (555) 392-1102",
    address: "742 Evergreen Terrace, Apt 4B",
    status: "Delayed",
    paymentStatus: "Paid (PayMongo)",
    createdAt: "2026-10-27T19:15:00Z",
    elapsedMinutes: 41,
    riderAssigned: "Carlos Rossi (Rider 04)",
    items: [
      {
        name: "Truffle Mushroom Risotto",
        qty: 1,
        variant: "Large Portion",
        addOns: ["Extra Truffle Oil"],
        price: 33.0,
      },
      {
        name: "Wood-Fired Margherita Pizza",
        qty: 2,
        variant: "16-inch Crust",
        addOns: ["Burrata Ball"],
        price: 57.0,
      },
    ],
    subtotal: 90.0,
    deliveryFee: 5.0,
    tax: 7.2,
    total: 102.2,
  },
  {
    id: "ord_1003",
    orderType: "Pickup",
    tableNumber: null,
    customerName: "Liam Hemsworth",
    customerPhone: "+1 (555) 882-9900",
    status: "Ready",
    paymentStatus: "Paid (Cash)",
    createdAt: "2026-10-27T19:30:00Z",
    elapsedMinutes: 26,
    items: [
      {
        name: "Wood-Fired Margherita Pizza",
        qty: 1,
        variant: "12-inch Crust",
        addOns: [],
        price: 18.0,
      },
    ],
    subtotal: 18.0,
    tax: 1.44,
    total: 19.44,
  },
  {
    id: "ord_1004",
    orderType: "Dine-In",
    tableNumber: "T-05",
    customerName: "VIP Corporate Party",
    status: "Served",
    paymentStatus: "Unpaid",
    createdAt: "2026-10-27T18:30:00Z",
    elapsedMinutes: 86,
    items: [
      {
        name: "A5 Wagyu Beef Burger",
        qty: 4,
        variant: "Medium",
        addOns: [],
        price: 112.0,
      },
      {
        name: "Truffle Mushroom Risotto",
        qty: 3,
        variant: "Regular Portion",
        addOns: [],
        price: 73.5,
      },
    ],
    subtotal: 185.5,
    serviceCharge: 18.55,
    tax: 14.84,
    total: 218.89,
  },
];
