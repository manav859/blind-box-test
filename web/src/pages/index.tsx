import { Navigate, useLocation } from "react-router-dom";

export default function IndexPage() {
  const location = useLocation();

  return (
    <Navigate
      replace
      to={{
        pathname: "/blind-box/pools",
        search: location.search,
      }}
    />
  );
}
