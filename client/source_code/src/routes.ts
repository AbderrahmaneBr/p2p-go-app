import ChatPage from "./pages/chat/content.tsx";
import Login from "./pages/login/content.tsx";

export const routes = [
  {
    path: "/",
    element: ChatPage,
  },
  {
    path: "/login",
    element: Login,
  },
];
