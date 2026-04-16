import { useLocation, useNavigate } from "react-router-dom";

export function useEmbeddedPath() {
  const location = useLocation();

  return (pathname: string) => ({
    pathname,
    search: location.search,
  });
}

export function useEmbeddedNavigate() {
  const navigate = useNavigate();
  const location = useLocation();

  return (pathname: string) =>
    navigate({
      pathname,
      search: location.search,
    });
}
