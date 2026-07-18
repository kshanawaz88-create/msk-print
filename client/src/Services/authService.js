import axios from "axios";

const API = "http://localhost:5000/api/auth";

export const login = async (email, password) => {
  const res = await axios.post(`${API}/login`, {
    email,
    password,
  });

  if (res.data.token) {
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(res.data.user));
  }

  return res.data;
};

export const register = async (data) => {
  const res = await axios.post(`${API}/register`, data);
  return res.data;
};

export const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

export const getToken = () => {
  return localStorage.getItem("token");
};

export const getUser = () => {
  return JSON.parse(localStorage.getItem("user"));
};