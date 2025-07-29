import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, User, Waypoints } from "lucide-react";
import Logo from "./components/logo";
import { useEffect, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const LoginPage = () => {
  const [username, setUsername] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [emptyUsernameError, setEmptyUsernameError] = useState(false);
  const [emptyRoomIdError, setEmptyRoomIdError] = useState(false);

  const [proceed, setProceed] = useState(false);

  const navigate = useNavigate();

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value || "";
    switch (e.target.name) {
      case "username":
        setUsername(value);
        break;
      case "roomId":
        setRoomId(value);
        break;
      default:
        break;
    }
  };

  const handleSubmit = () => {
    // Validatng
    if (!username?.trim()) {
      setEmptyUsernameError(true);
      return;
    } else {
      setEmptyUsernameError(false);
    }

    if (!roomId?.trim()) {
      setEmptyRoomIdError(true);
      return;
    } else {
      setEmptyRoomIdError(false);
    }

    // Success
    localStorage.setItem("blazeit_username", username);
    localStorage.setItem("blazeit_roomId", roomId);

    navigate("/");
  };

  useEffect(() => {
    let usr = localStorage.getItem("blazeit_username");
    let rId = localStorage.getItem("blazeit_roomId");

    if (usr?.trim() && rId?.trim()) {
      // proceed
      navigate("/");
    } else {
      setProceed(true);
    }
  }, [proceed]);

  return (
    proceed && (
      <main className="relative">
        <section className="fixed top-1/2 left-1/2 w-[27%] max-2xl:w-[40%] max-lg:w-full max-lg:-translate-y-0 max-lg:top-0 max-lg:pt-[15vh] max-lg:px-12 -translate-x-1/2 -translate-y-[80%] p-10 rounded-4xl border border-violet-100 bg-violet-50/80 backdrop-blur-md max-lg:bg-transparent max-lg:backdrop-blur-none max-lg:border-0 max-md:px-8 max-sm:px-4">
          <Logo />
          <div className="flex flex-col gap-3 mt-6 max-lg:gap-4 max-lg:mt-10">
            <div className="relative flex items-center max-lg:gap-3">
              <User
                className={cn(
                  "absolute left-4 size-4 text-violet-300",
                  emptyUsernameError && "text-red-400"
                )}
              />
              <Input
                name="username"
                onChange={handleInput}
                value={username}
                className={cn(
                  "w-full pl-10 py-5 max-lg:py-6 !bg-white rounded-2xl border-0 shadow-none font-normal !placeholder-violet-200 !text-[#4A4751] max-lg:border",
                  emptyUsernameError &&
                    "border border-red-300 !placeholder-red-300"
                )}
                placeholder="Username..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSubmit();
                  }
                }}
              />
            </div>

            <div className="relative flex items-center max-lg:gap-3">
              <Waypoints
                className={cn(
                  "absolute left-4 size-4 text-violet-300",
                  emptyRoomIdError && "text-red-400"
                )}
              />
              <Input
                name="roomId"
                onChange={handleInput}
                value={roomId}
                className={cn(
                  "w-full pl-10 py-5 max-lg:py-6 !bg-white rounded-2xl border-0 shadow-none font-normal !placeholder-violet-200 !text-[#4A4751] max-lg:border",
                  emptyRoomIdError &&
                    "border border-red-300 !placeholder-red-300"
                )}
                placeholder="RoomId..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSubmit();
                  }
                }}
              />
            </div>
          </div>
          <Separator className="my-3 max-lg:my-5" />
          <Button
            className="w-full bg-violet-900 hover:bg-violet-800 rounded-2xl py-6 relative max-lg:py-7"
            type="button"
            onClick={handleSubmit}
          >
            <ArrowRight className="absolute right-4" size={4} />
            Join
          </Button>
        </section>
      </main>
    )
  );
};

export default LoginPage;
