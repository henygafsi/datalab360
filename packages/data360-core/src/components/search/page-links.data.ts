import { routes } from "@core/config/routes";
import { PiUserCircleDuotone, PiHouseLineDuotone, PiMapPinLineDuotone, PiChartBarDuotone, PiCurrencyDollarDuotone, PiBriefcaseDuotone, PiStorefrontDuotone, PiShootingStarDuotone, PiBinocularsDuotone } from "react-icons/pi";

// Note: do not add href in the label object, it is rendering as label
export const pageLinks = [
  {
    id: "1",
    name: "Connection",
    title: "Connection",
    icon: PiUserCircleDuotone, // Adjust the icon as per your preference
    menuItems: [
      {
        name: "Data Source Connection",
        href: routes.connexion.dataSourceConnection,
        icon: PiHouseLineDuotone,
      },
    ],
  },
  {
    id: "2",
    name: "Mapping",
    title: "Mapping",
    icon: PiMapPinLineDuotone, // Adjust the icon as per your preference
    menuItems: [
      {
        name: "View Mapping",
        href: routes.mapping.viewMap,
        icon: PiMapPinLineDuotone,
      },
    ],
  },
  {
    id: "3",
    name: "BI Reporting",
    title: "BI Reporting",
    icon: PiChartBarDuotone, // Adjust the icon as per your preference
    menuItems: [
      {
        name: "View Reporting",
        href: routes.biReporting.viewReporting,
        icon: PiCurrencyDollarDuotone,
      }
    ],
  },
  {
    id: "4",
    name: "KPI's Store",
    title: "KPI's Store",
    icon: PiStorefrontDuotone, // Adjust the icon as per your preference
    menuItems: [
      {
        name: "View KPI",
        href: routes.kpiStore.view,
        icon: PiChartBarDuotone,
      },
    ],
  },
  {
    id: "5",
    name: "DaRquest / DAC",
    title: "DaRquest / DAC",
    icon: PiShootingStarDuotone, // Adjust the icon as per your preference
    menuItems: [
      {
        name: "Request Data",
        href: routes.daRquest.view,
        icon: PiShootingStarDuotone,
      },
    ],
  },
  {
    id: "6",
    name: "Observability",
    title: "Observability",
    icon: PiBinocularsDuotone, // Adjust the icon as per your preference
    menuItems: [
      {
        name: "System Status",
        href: routes.observability.systemStatus,
        icon: PiBinocularsDuotone,
      },
    ],
  },
];
