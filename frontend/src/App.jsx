import { Component, lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { visibleNavigation } from "./navigation";
import { Account } from "./Account";
import { AppShell } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { EmptyState, Feedback, Skeleton } from "./components/ui";
import { MenuBrowser } from "./features/Menu";

const screen = (loader, name) =>
  lazy(() => loader().then((module) => ({ default: module[name] })));
const OrdersView = screen(() => import("./features/Orders"), "OrdersView");
const MenuAdmin = screen(() => import("./features/CatalogAdmin"), "MenuAdmin");
const StaffAccounts = screen(
  () => import("./features/Administration"),
  "StaffAccounts",
);
const AuditLogView = screen(
  () => import("./features/Administration"),
  "AuditLogView",
);
const ReservationBooking = screen(
  () => import("./Reservations"),
  "ReservationBooking",
);
const MyReservations = screen(() => import("./Reservations"), "MyReservations");
const ReservationCalendar = screen(
  () => import("./AdminOperations"),
  "ReservationCalendar",
);
const ReservationSettings = screen(
  () => import("./Reservations"),
  "ReservationSettings",
);
const TableOccupancy = screen(() => import("./Reservations"), "TableOccupancy");
const FloorPlanEditor = screen(
  () => import("./Reservations"),
  "FloorPlanEditor",
);
const DeliverySettings = screen(
  () => import("./DeliveryMap"),
  "DeliverySettings",
);
const RestaurantLocation = screen(
  () => import("./DeliveryMap"),
  "RestaurantLocation",
);
const DispatchDashboard = screen(
  () => import("./DeliveryOperations"),
  "DispatchDashboard",
);
const RiderDashboard = screen(
  () => import("./DeliveryOperations"),
  "RiderDashboard",
);
const CustomerDeliveryTracking = screen(
  () => import("./DeliveryOperations"),
  "CustomerDeliveryTracking",
);
const PaymentSettings = screen(
  () => import("./PaymentOperations"),
  "PaymentSettings",
);
const PaymentDashboard = screen(
  () => import("./PaymentOperations"),
  "PaymentDashboard",
);
const PaymentReturn = screen(
  () => import("./PaymentOperations"),
  "PaymentReturn",
);
const PaymentReceipt = screen(
  () => import("./PaymentOperations"),
  "PaymentReceipt",
);
const BusinessSettings = screen(
  () => import("./AdminOperations"),
  "BusinessSettings",
);
const OperationsDashboard = screen(
  () => import("./AdminOperations"),
  "OperationsDashboard",
);
const ReportsDashboard = screen(
  () => import("./AdminOperations"),
  "ReportsDashboard",
);
const CashierSummary = screen(
  () => import("./AdminOperations"),
  "CashierSummary",
);

class ScreenBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="welcome">
        <h1>Something didn’t load.</h1>
        <Feedback onRetry={() => window.location.reload()}>
          Please refresh to try again. Your saved orders and reservations are
          safe.
        </Feedback>
      </section>
    ) : (
      this.props.children
    );
  }
}

function Workspace({ user, onSignOut, onUserUpdated, signOutError }) {
  const links = visibleNavigation(user.permissions, user.roles);
  const location = useLocation();
  const screens = {
    "/account": <Account user={user} onUpdated={onUserUpdated} />,
    "/menu": <MenuBrowser />,
    "/my-orders": <OrdersView />,
    "/orders": <OrdersView staff user={user} />,
    "/kitchen": <OrdersView kitchen staff user={user} />,
    "/admin/users": <StaffAccounts />,
    "/admin/audit": <AuditLogView />,
    "/admin/menu": <MenuAdmin />,
    "/reserve": <ReservationBooking user={user} />,
    "/my-reservations": <MyReservations />,
    "/reservations": <ReservationCalendar user={user} />,
    "/admin/floor-plan": <FloorPlanEditor />,
    "/service": <TableOccupancy />,
    "/admin/settings": <ReservationSettings />,
    "/admin/business-settings": <BusinessSettings />,
    "/admin/payment-settings": <PaymentSettings />,
    "/payments": <PaymentDashboard user={user} />,
    "/admin/delivery": <DeliverySettings />,
    "/admin/deliveries": <DispatchDashboard />,
    "/rider": <RiderDashboard />,
    "/dashboard": <OperationsDashboard user={user} />,
    "/reports": <ReportsDashboard user={user} />,
    "/cashier/summary": <CashierSummary />,
    "/restaurant": (
      <section className="welcome">
        <RestaurantLocation />
      </section>
    ),
  };
  return (
    <AppShell user={user} onSignOut={onSignOut}>
      {signOutError && <Feedback>{signOutError}</Feedback>}
      <ScreenBoundary key={location.pathname}>
        <Suspense fallback={<Skeleton label="Loading your page" />}>
          <Routes>
            <Route
              path="/"
              element={<Navigate to={links[0]?.[2] || "/account"} replace />}
            />
            {links
              .filter(([, , to]) => to !== "/account")
              .map(([, , to]) => (
                <Route key={to} path={to} element={screens[to]} />
              ))}
            <Route path="/account" element={screens["/account"]} />
            <Route
              path="/delivery/:deliveryId/tracking"
              element={<CustomerDeliveryTracking />}
            />
            <Route path="/payment-return" element={<PaymentReturn />} />
            <Route
              path="/payments/:paymentId/receipt"
              element={<PaymentReceipt />}
            />
            <Route
              path="*"
              element={
                <section className="welcome">
                  <h1>Not found</h1>
                  <EmptyState
                    title="Let’s get you back on track"
                    description="This page isn’t available for your account, or the address has changed."
                    to="/"
                    action="Back to your workspace"
                  />
                </section>
              }
            />
          </Routes>
        </Suspense>
      </ScreenBoundary>
    </AppShell>
  );
}

export default function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [signOutError, setSignOutError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    setError("");
    api("/me", { signal: controller.signal })
      .then((data) => setUser(data.user))
      .catch((failure) => {
        if (!controller.signal.aborted && ![401, 419].includes(failure.status))
          setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => controller.abort();
  }, [retry]);
  async function signOut() {
    try {
      await api("/logout", { method: "POST" });
      setSignOutError("");
      setUser(null);
    } catch (failure) {
      if ([401, 419].includes(failure.status)) setUser(null);
      else setSignOutError("We couldn’t sign you out. Please try again.");
    }
  }
  if (!ready)
    return (
      <main className="boot-screen">
        <div className="boot-brand">
          DineFlow<span>.</span>
        </div>
        <Skeleton cards={1} label="Loading your workspace" />
      </main>
    );
  if (error)
    return (
      <main className="boot-screen">
        <h1>Let’s reconnect.</h1>
        <Feedback onRetry={() => setRetry((value) => value + 1)}>
          {error}
        </Feedback>
      </main>
    );
  return (
    <ConfirmProvider>
      {user ? (
        <Workspace
          user={user}
          onSignOut={signOut}
          onUserUpdated={setUser}
          signOutError={signOutError}
        />
      ) : (
        <AuthScreen onSignedIn={setUser} />
      )}
    </ConfirmProvider>
  );
}
