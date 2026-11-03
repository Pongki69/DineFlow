import { Component, lazy, Suspense, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "./api";
import { defaultStartPath, visibleNavigation } from "./navigation";
import { Account } from "./Account";
import { AppShell } from "./components/AppShell";
import { RiderScreenSkeleton } from "./components/RiderScreenSkeleton";
import { AuthScreen } from "./components/AuthScreen";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { EmptyState, Feedback, Skeleton } from "./components/ui";
import { MenuBrowser } from "./features/Menu";
import { useWorkspaceTheme } from "./components/useWorkspaceTheme";
import { signInDestination } from "./components/signInDestination";
import { RiderDispatchPanel } from "./components/RiderDispatchPanel";
import { LiveUpdates } from "./components/LiveUpdates";
import { CustomerScreenSkeleton } from "./components/CustomerScreenSkeleton";
import { useMediaQuery } from "./components/useMediaQuery";
import { subscribeToLiveChanges } from "./liveUpdates";
import { initializeRealtime } from "./realtime";
import "./features/workspaceSettings.css";
import "./components/RiderScreenSkeleton.css";
const WorkspaceSettings = screen(
  () => import("./features/WorkspaceSettings"),
  "WorkspaceSettings",
);
const PublicLanding = screen(
  () => import("./features/PublicLanding"),
  "PublicLanding",
);
const AdminDashboard = screen(
  () => import("./features/AdminWorkspace"),
  "AdminDashboard",
);
const OutletManager = screen(
  () => import("./features/AdminWorkspace"),
  "OutletManager",
);
const RiderOverview = screen(
  () => import("./features/RiderWorkspace"),
  "RiderOverview",
);
const RiderHistory = screen(
  () => import("./features/RiderWorkspace"),
  "RiderHistory",
);
const RiderOrderDetails = screen(
  () => import("./features/RiderOrderDetails"),
  "RiderOrderDetails",
);
const RiderReviews = screen(
  () => import("./features/RiderReviews"),
  "RiderReviews",
);

function screen(loader, name) {
  return lazy(() => loader().then((module) => ({ default: module[name] })));
}
const OrdersView = screen(() => import("./features/Orders"), "OrdersView");
const MenuAdmin = screen(() => import("./features/CatalogAdmin"), "MenuAdmin");
const StaffAccounts = screen(
  () => import("./features/Administration"),
  "StaffAccounts",
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
const RiderDeliveries = screen(
  () => import("./DeliveryOperations"),
  "RiderDeliveries",
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
const CashierToday = screen(
  () => import("./features/CashierToday.jsx"),
  "CashierToday",
);
const CashierDesk = screen(
  () => import("./features/CashierDesk.jsx"),
  "CashierDesk",
);
const MyActivity = screen(
  () => import("./features/ActivityLog.jsx"),
  "MyActivity",
);
const TeamActivity = screen(
  () => import("./features/ActivityLog.jsx"),
  "TeamActivity",
);
const AdminCustomers = screen(
  () => import("./features/AdminCustomers.jsx"),
  "AdminCustomers",
);
const WaiterFloor = screen(
  () => import("./features/WaiterFloor.jsx"),
  "WaiterFloor",
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
  useEffect(
    () =>
      subscribeToLiveChanges(async () => {
        const result = await api("/me");
        onUserUpdated(result.user);
      }, ["accounts"]),
    [user.id, onUserUpdated],
  );
  const navigate = useNavigate();
  const links = visibleNavigation(user.permissions, user.roles);
  const cashierOnly =
    user.roles.includes("cashier") &&
    !user.roles.some((role) => ["administrator", "manager"].includes(role));
  const waiterOnly =
    user.roles.includes("waiter") &&
    !user.roles.some((role) =>
      ["administrator", "manager", "cashier"].includes(role),
    );
  const location = useLocation();
  // Phones apply live updates by themselves; pull to refresh is the manual way.
  const compactScreen = useMediaQuery("(max-width: 850px)");
  // Pull to refresh reopens the page: it loads again behind its own skeleton.
  const [pageRefresh, setPageRefresh] = useState(0);
  useEffect(() => {
    const reopen = () => setPageRefresh((value) => value + 1);
    window.addEventListener("dineflow:reload-page", reopen);
    return () => window.removeEventListener("dineflow:reload-page", reopen);
  }, []);
  // Customers: a placeholder shaped like the page that is loading.
  const customerLoadingVariant = !user.roles.includes("customer")
    ? null
    : location.pathname === "/menu"
      ? "menu"
      : location.pathname === "/my-orders"
        ? "orders"
        : location.pathname === "/reserve"
          ? "booking"
          : location.pathname === "/my-reservations"
            ? "bookings"
            : location.pathname === "/settings"
              ? "profile"
              : location.pathname === "/account"
                ? "account"
                : location.pathname.startsWith("/delivery/")
                  ? "tracking"
                  : null;
  const riderLoadingVariant =
    location.pathname === "/rider"
      ? "dashboard"
      : location.pathname === "/rider/deliveries"
        ? "deliveries"
        : location.pathname === "/rider/history"
          ? "history"
          : location.pathname === "/rider/reviews"
            ? "reviews"
            : location.pathname.startsWith("/rider/deliveries/")
              ? "details"
              : location.pathname === "/settings" &&
                  user.roles.includes("rider")
                ? "profile"
                : null;
  const screens = {
    "/account": <Account user={user} onUpdated={onUserUpdated} />,
    "/settings": (
      <WorkspaceSettings
        user={user}
        onUpdated={onUserUpdated}
        onDeleted={() => {
          onUserUpdated(null);
          navigate("/login", {
            replace: true,
            state: { accountDeleted: true },
          });
        }}
      />
    ),
    "/menu": <MenuBrowser key={user.id} user={user} />,
    "/my-orders": <OrdersView />,
    "/orders": <OrdersView staff user={user} />,
    "/kitchen": <OrdersView kitchen staff user={user} />,
    "/admin/users": <StaffAccounts />,
    "/admin/customers": <AdminCustomers />,
    "/admin/audit": <TeamActivity />,
    "/activity": <MyActivity />,
    "/admin/menu": <MenuAdmin />,
    "/reserve": <ReservationBooking user={user} />,
    "/my-reservations": <MyReservations />,
    "/reservations": <ReservationCalendar user={user} />,
    "/admin/floor-plan": <FloorPlanEditor />,
    // Waiters get the floor; managers keep the full occupancy board.
    "/service": waiterOnly ? <WaiterFloor /> : <TableOccupancy />,
    "/admin/settings": <ReservationSettings />,
    "/admin/business-settings": <BusinessSettings />,
    "/admin/payment-settings": <PaymentSettings />,
    // Cashiers get the counter desk; managers and admins the full payments view.
    "/payments": cashierOnly ? (
      <CashierDesk />
    ) : (
      <PaymentDashboard user={user} />
    ),
    "/admin/delivery": <DeliverySettings />,
    "/admin/deliveries": <DispatchDashboard />,
    "/admin/tracking": <AdminDashboard user={user} tracking />,
    "/admin/dashboard": <AdminDashboard user={user} />,
    "/admin/orders": <OrdersView staff user={user} />,
    "/admin/system-settings": <BusinessSettings />,
    "/admin/outlets": <OutletManager />,
    "/admin/riders": <Navigate to="/admin/tracking?view=riders" replace />,
    "/rider": <RiderOverview user={user} />,
    "/rider/deliveries": <RiderDeliveries />,
    "/rider/history": <RiderHistory />,
    "/rider/reviews": <RiderReviews own />,
    "/rider/offers": null,
    "/dashboard": <OperationsDashboard user={user} />,
    "/reports": <ReportsDashboard user={user} />,
    "/cashier/summary": <CashierToday user={user} />,
    "/restaurant": (
      <section className="welcome">
        <RestaurantLocation />
      </section>
    ),
  };
  return (
    <AppShell user={user} onSignOut={onSignOut}>
      <LiveUpdates
        userId={user.id}
        seamless={user.roles.includes("rider") || compactScreen}
      />
      {signOutError && <Feedback>{signOutError}</Feedback>}
      {user.roles.includes("rider") &&
        user.permissions.includes("deliveries.assigned") && (
          <div className="rider-availability">
            {location.pathname === "/rider/offers" && (
              <header className="page-heading rider-offers-page-heading">
                <div>
                  <h1>Delivery offers</h1>
                  <p>
                    Find nearby deliveries and review each offer before
                    accepting.
                  </p>
                </div>
              </header>
            )}
            <RiderDispatchPanel
              headerOnly
              compact={location.pathname !== "/rider/offers"}
              onAccepted={() =>
                window.dispatchEvent(new Event("rider-deliveries-updated"))
              }
            />
          </div>
        )}
      <ScreenBoundary key={`${location.pathname}#${pageRefresh}`}>
        <Suspense
          fallback={
            riderLoadingVariant ? (
              <RiderScreenSkeleton variant={riderLoadingVariant} showHeading />
            ) : customerLoadingVariant ? (
              <CustomerScreenSkeleton variant={customerLoadingVariant} />
            ) : (
              <Skeleton label="Loading your page" />
            )
          }
        >
          <Routes>
            <Route
              path="/"
              element={
                <Navigate
                  to={
                    user.preferences?.home_page === "/account" ||
                    links.some(([, , to]) => to === user.preferences?.home_page)
                      ? user.preferences.home_page
                      : defaultStartPath(links, user.roles)
                  }
                  replace
                />
              }
            />
            {links
              .filter(([, , to]) => to !== "/account")
              .map(([, , to]) => (
                <Route key={to} path={to} element={screens[to]} />
              ))}
            <Route path="/account" element={screens["/account"]} />
            <Route
              path="/delivery/:deliveryId/tracking"
              element={<CustomerDeliveryTracking user={user} />}
            />
            {user.roles.includes("rider") &&
              user.permissions.includes("deliveries.assigned") && (
                <Route
                  path="/rider/deliveries/:deliveryId"
                  element={<RiderOrderDetails />}
                />
              )}
            <Route path="/riders/:riderId" element={<RiderReviews />} />
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

const REPLACED_KEY = "dineflow.signedInElsewhere";

function AppContent() {
  useEffect(() => {
    initializeRealtime().catch(() => {});
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [signOutError, setSignOutError] = useState(""),
    [replaced, setReplacedState] = useState(() => {
      try {
        return sessionStorage.getItem(REPLACED_KEY) === "1";
      } catch {
        return false;
      }
    });
  // Kept for this tab, so a reload still says why it was signed out.
  const setReplaced = (value) => {
    setReplacedState(value);
    try {
      if (value) sessionStorage.setItem(REPLACED_KEY, "1");
      else sessionStorage.removeItem(REPLACED_KEY);
    } catch {
      // Storage can be unavailable (private mode); the notice still shows now.
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    setError("");
    api("/me", { signal: controller.signal })
      .then((data) => setUser(data.user))
      .catch((failure) => {
        if (failure.code === "session_replaced") setReplaced(true);
        if (!controller.signal.aborted && ![401, 419].includes(failure.status))
          setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => controller.abort();
  }, [retry]);
  // Signed in somewhere else: drop this device back to the sign-in page.
  useEffect(() => {
    const signedOutHere = () => {
      setReplaced(true);
      setUser(null);
      navigate("/login", { replace: true });
    };
    window.addEventListener("dineflow:session-replaced", signedOutHere);
    return () =>
      window.removeEventListener("dineflow:session-replaced", signedOutHere);
  }, [navigate]);
  async function signOut() {
    try {
      await api("/logout", { method: "POST" });
      setSignOutError("");
      setUser(null);
      navigate("/", { replace: true });
    } catch (failure) {
      if ([401, 419].includes(failure.status)) setUser(null);
      else setSignOutError("We couldn’t sign you out. Please try again.");
    }
  }
  function signedIn(nextUser) {
    const requested =
      new URLSearchParams(location.search).get("next") ||
      `${location.pathname}${location.search}`;
    const destination = signInDestination(
      nextUser,
      requested,
      window.location.origin,
    );
    setReplaced(false);
    setUser(nextUser);
    navigate(destination, { replace: true });
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
      ) : location.pathname === "/" ? (
        <Suspense
          fallback={
            <main className="public-loading">
              <Skeleton label="Loading restaurant" />
            </main>
          }
        >
          <PublicLanding />
        </Suspense>
      ) : (
        <div className="production-auth">
          <AuthScreen
            initialNotice={
              location.state?.accountDeleted
                ? "Your account has been deleted."
                : replaced
                  ? "You were signed out because your account signed in on another device. Only one device can use an account at a time."
                  : ""
            }
            key={location.pathname}
            initialMode={
              location.pathname === "/register"
                ? "register"
                : location.pathname === "/forgot-password"
                  ? "forgot"
                  : "login"
            }
            onSignedIn={signedIn}
          />
        </div>
      )}
    </ConfirmProvider>
  );
}

export default function App() {
  const { theme } = useWorkspaceTheme();
  return (
    <div className="df-theme dineflow-app" data-df-theme={theme}>
      <AppContent />
    </div>
  );
}
