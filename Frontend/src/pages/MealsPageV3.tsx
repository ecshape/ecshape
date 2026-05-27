import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MealMenuV3 } from "./SandboxMealsV3";
import { useAuth } from "../contexts/AuthContext";

/**
 * Production trainee meals: same component tree as `/sandbox/meals-v3` (real API).
 * `MealMenuV3` wraps itself in `Layout` — do not add a second Layout here.
 */
const MealsPageV3 = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      if (user.role === "ADMIN") {
        navigate("/admin", { replace: true });
      } else if (user.role === "TRAINER") {
        navigate("/trainer-dashboard", { replace: true });
      }
    }
  }, [user, navigate]);

  if (!user || user.role !== "CLIENT") {
    return null;
  }

  return <MealMenuV3 mode="real" />;
};

export default MealsPageV3;
