import React, { useState } from "react";
import API from "../Services/Api";

function Upload() {

  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");

  const handleUpload = async () => {

    if (!file) {
      alert("Please select a file");
      return;
    }


    const formData = new FormData();

    formData.append("file", file);


    try {

      const response = await API.post(
        "/api/print",
        formData,
        {
          headers:{
            "Content-Type":"multipart/form-data"
          }
        }
      );


      localStorage.setItem(
  "printJobId",
  response.data.jobId
);

window.location.href = "/payment";


    } catch(error){

      console.log(error);
      setMessage("Upload failed");

    }

  };


  return (

    <div>

      <h2>Upload Print File</h2>


      <input
        type="file"
        onChange={(e)=>setFile(e.target.files[0])}
      />


      <br/><br/>


      <button onClick={handleUpload}>
        Continue to Payment
      </button>


      <p>{message}</p>


    </div>

  );
}


export default Upload;