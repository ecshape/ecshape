import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import MealsScreen from "@/features/trainee/MealsScreen";
import { useAuth } from "../contexts/AuthContext";

/** Trainee meal day (live data from /v3/meals). `/sandbox/meals-v3` keeps the old mock playground. */
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

  return (
    <Layout currentPage="meals">
      <MealsScreen />
    </Layout>
  );
};

export default MealsPageV3;
