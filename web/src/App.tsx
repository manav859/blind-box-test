import { RouterProvider } from "react-router-dom";
import { createRouter } from "./Routes";

function App() {
  const pages = {
    ...import.meta.glob("./pages/index.tsx", { eager: true }),
    ...import.meta.glob("./pages/Exit-iframe.tsx", { eager: true }),
  } as Record<string, any>;

  return <RouterProvider router={createRouter(pages)} />;
}

export default App;
