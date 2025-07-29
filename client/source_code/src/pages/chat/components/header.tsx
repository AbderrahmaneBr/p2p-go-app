import { Button } from "@/components/ui/button";
import Logo from "@/pages/login/components/logo";
import { Unplug } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageInterface {
  roomId: string;
}

const Header = ({ roomId }: PageInterface) => {
  const navigate = useNavigate();

  const handleDisconnect = () => {
    localStorage.removeItem("blazeit_username");
    localStorage.removeItem("blazeit_roomId");

    navigate("/login");
  };

  return (
    <header className="px-12 py-6 flex items-center justify-between w-full max-lg:py-4 max-lg:px-4 max-lg:max-h-[10vh]">
      <div className="flex items-end gap-6 max-lg:flex-col max-lg:gap-0">
        <Logo className={"text-left"} />
        <p className="text-[#949494] font-semibold pb-0.5">
          <span className="text-xs font-light select-none">ROOM ID: </span>
          {roomId}
        </p>
      </div>
      <Button variant={"destructive"} onClick={handleDisconnect}>
        <Unplug />
        Disconnect
      </Button>
    </header>
  );
};

export default Header;
