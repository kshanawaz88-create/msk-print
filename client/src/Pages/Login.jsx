import React, { useState } from "react";
import API from "../Services/Api";
import { clearSession, storeSession } from "../Services/session";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = async (e) => {
    e.preventDefault();
    clearSession();

    try {
      const res = await API.post("/api/auth/login", {
        email,
        password,
      });

      storeSession(res.data?.token, res.data?.user);

      alert("Login Successful!");

      const role = res.data.user.role;

      const destinations = {
        admin: "/admin",
        shopOwner: "/shop-owner",
        staff: "/staff",
        customer: "/upload",
      };
      window.location.href = destinations[role] || "/login";
    } catch (error) {
      alert(error.response?.data?.message || "Login Failed");
    }
  };

  return (
    <div
      style={{
        maxWidth: "400px",
        margin: "50px auto",
      }}
    >
      <h2>MSK Print Login</h2>

      <form onSubmit={login}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "10px",
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "10px",
          }}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px",
            cursor: "pointer",
          }}
        >
          Login
        </button>
      </form>
    </div>
  );
}

export default Login;
