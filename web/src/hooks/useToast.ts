import { Message } from "@shoplinedev/appbridge";
import { useAppBridge } from "./useAppBridge";

export function useToast() {
  const app = useAppBridge();

  return {
    success(messageInfo: string) {
      Message.create(app).open({
        messageInfo,
        type: "success",
      });
    },
    error(messageInfo: string) {
      Message.create(app).open({
        messageInfo,
        type: "error",
      });
    },
  };
}
