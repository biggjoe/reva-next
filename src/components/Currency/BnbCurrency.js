import React, { useEffect, useState, useCallback, useMemo } from "react";
import BigNumber from "bignumber.js";
import toast, { Toaster } from "react-hot-toast";
import Link from "next/link";
import ConnectWalletButton from "../../components/ConnectWalletButton";
import axios from "axios";
import {
  useAccount,
  useContractWrite,
  useContractRead,
  usePrepareContractWrite,
  useWaitForTransaction,
  useBalance,
  useContractEvent,
} from "wagmi";
import { parseUnits, parseEther, formatEther, formatUnits } from "viem";
import presaleAbi from "../../abi/presale.json";
import { tokenAdd, contractAddr, chainId } from "../../config";
import FontAwesome from "react-fontawesome";
import { UserContext } from "../../services/UserContext";
import PromptLogin from "../PromptLogin";
import useAuthService from "../../services/useAuthService";
import BuyModal from "../BuyModal";
import HttpService from "../../services/HttpService";
import LoadingModal from "../LoadingModal";
import AmountForm from "./AmountForm";
import AffiliatePane from "./AffiliatePane";
import ReferralPane from "./ReferralPane";
import numberWithCommas from "../../pipes/Number";
import PayInvoice from "./PayInvoice";

export default function BnbCurrency(props) {
  const { 
    affiliate_data,
    ref_data,
    set_aff,
    set_ref,
    applyBonus,
    removeBonus,
    handleBonusInput,
    fetching_bonus,
    bonus_fetched,
    fetching_referee,
    referee_fetched } = props;
  const [bnbAmount, setBnbAmount] = useState("");
  const [bnbErrorMessage, setBnbErrorMessage] = useState("");
  const AuthServ = useAuthService();
  const usd = AuthServ.getCurrentUser();
  const [user_loaded, setUserLoaded] = React.useState(false);
  const [user_data, setUser] = React.useState(usd);
  const [isLogged, setIsLogged] = React.useState(false);
  React.useEffect(() => {
    setIsLogged(AuthServ.isLogged());
    setUserLoaded(AuthServ.isLogged());
  }, [AuthServ, AuthServ.isLogged]);
  const tknd = affiliate_data ? affiliate_data : { bonus_ran: false };
  const [token_data, setTokenData] = React.useState(tknd);
  const closeBux = () => {
    setBux({ ...bux_data, onopen: false });
  };
  const [bux_data, setBux] = React.useState({
    onopen: false,
    onclose: closeBux,
  });

  const launchBuy = () => {
    setBux({ ...bux_data, onopen: true, onclose: closeBux });
  };

  
  const closeLoader = () => setLoadData({ ...load_data, open: false });
  const [load_data, setLoadData] = React.useState({
    open: false,
    onclose: closeLoader,
  });

  let doLoader = (state,message,mode=false) => {
    setLoadData({ ...load_data, open: state,
      onclose: closeLoader,message:message,mode:mode });
  };

  const closeInvoice = () => setInvoice({ ...invoice_data, onopen: false });
  const [invoice_data, setInvoice] = React.useState({
    onopen: false,
    onclose: closeInvoice,
  });


  const { address } = useAccount();

  const balanceBnb = useBalance({
    address: address,
    chainId: chainId,
    enabled: !!address,
    watch: true,
  });

  const bnbBalanceBig = new BigNumber(balanceBnb.data?.formatted);
  const isValidBnb = bnbBalanceBig.gte(bnbAmount);

  const { config } = usePrepareContractWrite({
    address: contractAddr,
    abi: presaleAbi,
    functionName: "buyTokensWithBNB",
    value: [parseEther(bnbAmount)],
    enabled: !!address && !!bnbAmount && !!isValidBnb,
    chainId: chainId,
  });

  const { data, write } = useContractWrite(config);

  const { isLoading, isSuccess, isError } = useWaitForTransaction({
    hash: data?.hash,
  });

  const getAmount = useContractRead({
    address: contractAddr,
    abi: presaleAbi,
    functionName: "getTokenAmountBNB",
    args: [parseEther(bnbAmount)],
    enabled: !!bnbAmount,
    watch: true,
    chainId: chainId,
  });

const getResult = new BigNumber(getAmount.data);
  const resx = isNaN(getResult)
    ? 0
    : new BigNumber(getResult).dividedBy(new BigNumber(10).pow(18)).toFixed(3);

  const result = numberWithCommas(resx);

let success_message =   <div className="text-center py-2">
Success! XRV Purchase Complete
<div>
  <Link
    style={{ color: "#fff" }}
    href={`https://testnet.bscscan.com/tx/${data?.hash}`}
  >
    View On Bscscan
  </Link>
</div>
</div>;

  useEffect(() => {
    if (isSuccess) {
      doLoader(true,success_message,"component")
      toast.success(success_message);
      const timeout = setTimeout(() => {
        doLoader(false,"")
        toast.dismiss();
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isSuccess, data?.hash]);

  let error_message = 
  <div className="text-center py-2">Error! Something Went Wrong</div>
;
  useEffect(() => {
    if (isError) {
      doLoader(true,error_message)
      toast.error(error_message );
      const timeout = setTimeout(() => {
        doLoader(false,"")
        toast.dismiss();
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isError]);

  const handlebnbAmountChange = useMemo(
    () => (event) => {
      const inputValue = event.target.value;
      const parsedAmount = Number(inputValue);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setBnbErrorMessage("Amount must be greater than zero");
      } else if (balanceBnb.data?.formatted < parsedAmount) {
        setBnbErrorMessage("Insufficient balance.");
      } else {
        setBnbErrorMessage("");
      }
      setBnbAmount(inputValue);
    },
    [balanceBnb.data?.formatted]
  );

  useEffect(() => {
    const handlePostRequest = async () => {
      try {
        if (isSuccess) {
          doLoader(true,"Payment received. Processing dashboard balance...")
          setTokenData({ ...token_data, total_tokens: result });
          const additionalData = {
            id: user_data?.id,
            tx_id: user_data?.txn_id,
            tx_hash: data?.hash,
            date_time: new Date().toUTCString(),
            tx_status: "success",
            user_address: address,
            payment_currency: "BNB",
            paid_amount: bnbAmount,
            received_amount_in_token: result,
            affiliate_data: token_data,
            referral_data: ref_data,
          };
          const jsonData = JSON.stringify(additionalData);

          const response = await axios.post(
            "https://www.token.reva.finance/api/push_payment?secret=ZMpAShQwlOxzHYnJ97UkwLaW",
            jsonData,
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          console.log("Server response:", response.data);
          doLoader(true,response.data.message)
          if(response.data.status===1){
          const jwt = response.data.new_jwt;
          localStorage.setItem("access_token", jwt);
        }
        }
      } catch (error) {
        console.error("Error:", error);
        let Err = ()=>{return <span className="color-red spacer">{error.message}</span>;}
        doLoader(true,<Err/>,"component")
      }
    };
    handlePostRequest();
  }, [
    isSuccess,
    data?.hash
  ]);

  const [is_bonused, setBonused] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [show_code, setShowCode] = React.useState(false);
  const [show_init, setShowInit] = React.useState(false);
  const togAff = () => setShowCode(!show_code);
  const togOnce = () => setShowInit(!show_init);

  
  const launchInvoice = () => {
    setInvoice({ ...invoice_data, currency:"bnb", amount:bnbAmount, onopen: true, onclose: closeInvoice });
    console.log(invoice_data);
  };
  return (
    <React.Fragment>
       <AmountForm
        handleCurrAmountChange={handlebnbAmountChange}
        curr={"bnb"}
        result={result}
        currAmount={bnbAmount}
        currErrorMessage={bnbErrorMessage}
      />

{isLogged && (
        <>
        <AffiliatePane
          affiliate_data={affiliate_data}
          show_init={show_init}
          show_code={show_code}
          togAff={togAff}
          handleBonusInput={handleBonusInput}
          applyBonus={applyBonus}
          removeBonus={removeBonus}
          fetching_bonus={fetching_bonus}
        />
            <ReferralPane ref_data={ref_data}
            fetching_referee={fetching_referee}
            referee_fetched={referee_fetched}/>

        
        <div className="text-center">
              {address ? (<div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "5px",
          }}
        >
                <button
                  type="button"
                  className="buy_token_button"
                  disabled={!write || isLoading}
                  onClick={() => write()}
                >
                  {isLoading ? "Buying..." : "Buy Now"}
                </button>
                </div>
              ) : (<>
              
              <div className="text-center">
<div className="cover-div">
  <div
    className="btn-div"
    style={{ opacity: bnbAmount > 0 ? "1" : "0.3" }}
  >
    <button
      onClick={() => launchInvoice()}
      disabled={bnbAmount <= 0}
      className="buy_token_button"
    >
      CONTINUE
    </button>
  </div>
</div>
</div></>
              )}
            </div>
        </>)}
     

        {!isLogged && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            <PromptLogin
              button_text="BUY TOKEN"
              button_class="buy_token_button"
              mode="custom"
              return_call={launchBuy}
              return_url="/purchase"
              do_redirect={true}
            />
          </div>
        )}
        {invoice_data?.onopen && <PayInvoice data={invoice_data} />}
              {bux_data?.onopen &&  <BuyModal data={bux_data} />}
              {load_data?.open &&  <LoadingModal data={load_data} />}
    </React.Fragment>
  );
}
