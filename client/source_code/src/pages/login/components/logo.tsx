import { cn } from "@/lib/utils";

interface PageInterface {
  className?: string;
}

const Logo = ({ className }: PageInterface) => {
  return (
    <h2
      className={cn(
        "text-4xl font-extrabold text-violet-900 text-center select-none",
        className
      )}
      style={{ fontFamily: "Poppins" }}
    >
      BlazeIt
    </h2>
  );
};

export default Logo;
